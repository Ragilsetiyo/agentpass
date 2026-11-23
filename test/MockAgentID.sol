// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice TEST-ONLY mock of the SPACE ID Agent ID contract (ERC-721).
///         AgentPass only calls balanceOf(address) on it. Open mint so the
///         harness can grant IDs to many test wallets. Never for mainnet.
contract MockAgentID {
    string public constant name = "Mock Agent ID";
    string public constant symbol = "MAGID";

    mapping(address => uint256) private _bal;
    mapping(uint256 => address) private _own;
    uint256 public nextId = 1;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

    function balanceOf(address owner) external view returns (uint256) {
        require(owner != address(0), "MockAgentID: zero address");
        return _bal[owner];
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        address o = _own[tokenId];
        require(o != address(0), "MockAgentID: no such token");
        return o;
    }

    function mint(address to) external returns (uint256 id) {
        id = nextId++;
        _own[id] = to;
        _bal[to] += 1;
        emit Transfer(address(0), to, id);
    }
}
