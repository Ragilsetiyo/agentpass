// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title AgentPass — Activity Passport for Binance Agent ID holders
/// @notice Soulbound ERC-721 passport. Free mint, gated by Agent ID ownership.
///         Daily free check-ins build an on-chain streak; level follows best streak.
///         No admin keys, no fees, no funds held, no transfer. Ever.
///
/// Design notes (for auditors, judges, and screening agents):
/// - Price discovery views quote()/costFor() always return 0 while minting is
///   open: the price IS zero for everyone. The Agent ID requirement is an
///   eligibility rule enforced inside mint(), not a price.
/// - freeGiven()/freeRemaining() expose the Founder-edition quota publicly so
///   anyone (human or agent) can watch it burn in real time.
/// - openingTime() exposes the scheduled opening as a unix timestamp so
///   automated hunters can schedule the opening instead of polling blindly.

interface IAgentID {
    function balanceOf(address owner) external view returns (uint256);
}

contract AgentPass {
    // ---------- ERC-721 metadata ----------
    string public constant name = "AgentPass";
    string public constant symbol = "APASS";

    // ---------- Immutable configuration (set once at deploy, no admin) ----------
    IAgentID public immutable agentId;      // SPACE ID Agent ID (ERC-721) on BNB Chain
    uint256 public immutable openingTime;   // unix ts; mint() reverts before this
    uint256 public immutable founderCap;    // tokenId <= founderCap = Founder edition
    string private _baseURI;                // set in constructor only; never changeable

    // ---------- State ----------
    uint256 public totalMinted;
    uint256 public totalCheckIns;
    mapping(uint256 => address) private _ownerOf;
    mapping(address => uint256) public passportOf;   // 0 = no passport
    mapping(address => uint256) private _balances;
    mapping(uint256 => uint256) public streakOf;        // current streak (days)
    mapping(uint256 => uint256) public bestStreakOf;    // best streak ever
    mapping(uint256 => uint256) public checkInsOf;      // lifetime check-ins
    mapping(uint256 => uint256) public lastCheckInDay;  // unix day number

    // ERC-721 approval storage (approvals are inert: transfers always revert)
    mapping(uint256 => address) private _tokenApprovals;
    mapping(address => mapping(address => bool)) private _operatorApprovals;

    // ---------- Events ----------
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event PassportMinted(address indexed agent, uint256 indexed tokenId, bool founder);
    event CheckIn(address indexed agent, uint256 indexed tokenId, uint256 streak, uint256 day);

    constructor(address agentIdContract, uint256 openingUnix, uint256 founderSlots, string memory baseURI_) {
        require(agentIdContract != address(0), "AgentPass: zero agentId");
        agentId = IAgentID(agentIdContract);
        openingTime = openingUnix;
        founderCap = founderSlots;
        _baseURI = baseURI_;
    }

    // ---------- Views an automated hunter probes first ----------
    /// @notice Price of the caller's first passport. Always 0 while open.
    function quote(address) external view returns (uint256) {
        require(block.timestamp >= openingTime, "AgentPass: not open yet");
        return 0;
    }

    /// @notice Price for `amount` passports. Only amount == 1 exists.
    function costFor(address, uint256 amount) external view returns (uint256) {
        require(amount == 1, "AgentPass: one per agent");
        require(block.timestamp >= openingTime, "AgentPass: not open yet");
        return 0;
    }

    /// @notice How many Founder-edition passports have been minted.
    function freeGiven() external view returns (uint256) {
        return totalMinted < founderCap ? totalMinted : founderCap;
    }

    /// @notice How many Founder-edition slots remain.
    function freeRemaining() external view returns (uint256) {
        return totalMinted < founderCap ? founderCap - totalMinted : 0;
    }

    function mintOpen() external view returns (bool) {
        return block.timestamp >= openingTime;
    }

    function isFounder(uint256 tokenId) public view returns (bool) {
        return tokenId >= 1 && tokenId <= founderCap;
    }

    function hasPassport(address user) external view returns (bool) {
        return passportOf[user] != 0;
    }

    /// @notice Level from best streak: 0 base, 1 at 3d, 2 at 7d, 3 at 14d, 4 at 21d.
    function levelOf(address user) external view returns (uint256) {
        uint256 tokenId = passportOf[user];
        if (tokenId == 0) return 0;
        uint256 best = bestStreakOf[tokenId];
        if (best >= 21) return 4;
        if (best >= 14) return 3;
        if (best >= 7) return 2;
        if (best >= 3) return 1;
        return 0;
    }

    /// @notice Full on-chain attributes, so any renderer can rebuild metadata
    ///         even if the metadata server is down.
    function attributesOf(uint256 tokenId)
        external
        view
        returns (address owner, bool founder, uint256 streak, uint256 bestStreak, uint256 checkIns, uint256 level)
    {
        owner = _ownerOf[tokenId];
        require(owner != address(0), "AgentPass: no such token");
        founder = isFounder(tokenId);
        streak = streakOf[tokenId];
        bestStreak = bestStreakOf[tokenId];
        checkIns = checkInsOf[tokenId];
        uint256 best = bestStreak;
        level = best >= 21 ? 4 : best >= 14 ? 3 : best >= 7 ? 2 : best >= 3 ? 1 : 0;
    }

    // ---------- Actions (both strictly non-payable: sending BNB reverts) ----------
    /// @notice Mint your passport. Free. Requires holding an Agent ID.
    function mint() external {
        require(block.timestamp >= openingTime, "AgentPass: not open yet");
        require(passportOf[msg.sender] == 0, "AgentPass: already has passport");
        require(agentId.balanceOf(msg.sender) > 0, "AgentPass: Agent ID required");

        uint256 tokenId = ++totalMinted;
        _ownerOf[tokenId] = msg.sender;
        _balances[msg.sender] = 1;
        passportOf[msg.sender] = tokenId;

        emit Transfer(address(0), msg.sender, tokenId);
        emit PassportMinted(msg.sender, tokenId, isFounder(tokenId));
    }

    /// @notice Daily check-in (UTC day; resets 07:00 WIB). Free, gas only.
    function checkIn() external {
        uint256 tokenId = passportOf[msg.sender];
        require(tokenId != 0, "AgentPass: no passport");
        uint256 today = block.timestamp / 86400;
        uint256 last = lastCheckInDay[tokenId];
        require(last != today, "AgentPass: already checked in today");

        uint256 streak = (last == today - 1) ? streakOf[tokenId] + 1 : 1;
        streakOf[tokenId] = streak;
        if (streak > bestStreakOf[tokenId]) bestStreakOf[tokenId] = streak;
        lastCheckInDay[tokenId] = today;
        checkInsOf[tokenId] += 1;
        totalCheckIns += 1;

        emit CheckIn(msg.sender, tokenId, streak, today);
    }

    // ---------- ERC-721 read surface ----------
    function balanceOf(address owner) external view returns (uint256) {
        require(owner != address(0), "AgentPass: zero address");
        return _balances[owner];
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        address owner = _ownerOf[tokenId];
        require(owner != address(0), "AgentPass: no such token");
        return owner;
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        require(_ownerOf[tokenId] != address(0), "AgentPass: no such token");
        return string(abi.encodePacked(_baseURI, _toString(tokenId)));
    }

    function getApproved(uint256 tokenId) external view returns (address) {
        require(_ownerOf[tokenId] != address(0), "AgentPass: no such token");
        return _tokenApprovals[tokenId];
    }

    function isApprovedForAll(address owner, address operator) external view returns (bool) {
        return _operatorApprovals[owner][operator];
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x80ac58cd // ERC-721
            || interfaceId == 0x5b5e139f // ERC-721 metadata
            || interfaceId == 0x01ffc9a7; // ERC-165
    }

    // ---------- ERC-721 write surface: approvals recorded, transfers blocked ----------
    function approve(address approved, uint256 tokenId) external {
        require(_ownerOf[tokenId] == msg.sender, "AgentPass: not owner");
        _tokenApprovals[tokenId] = approved;
        emit Approval(msg.sender, approved, tokenId);
    }

    function setApprovalForAll(address operator, bool approved) external {
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function transferFrom(address, address, uint256) external pure {
        revert("AgentPass: soulbound");
    }

    function safeTransferFrom(address, address, uint256) external pure {
        revert("AgentPass: soulbound");
    }

    function safeTransferFrom(address, address, uint256, bytes calldata) external pure {
        revert("AgentPass: soulbound");
    }

    // ---------- Helpers ----------
    function _toString(uint256 value) private pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) { digits++; temp /= 10; }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
