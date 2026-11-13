// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

/**
 * @title TraceChainStub
 * @notice *** STUB CONTRACT FOR CALEB BOWERS' HASH-CONSISTENCY SPIKE ONLY. ***
 *
 * This is NOT the real TraceChain contract. Nick Crockett owns the real smart contract and his spike covers
 * transaction fees, confirmation latency and the Layer 2 deployment. This stub exists only so the API, the
 * database and the browser have a real EVM record to compare against. It deliberately implements the minimum:
 *   - an admin and an isAuthorized mapping that only admin can change
 *   - register(bytes32 itemId, bytes32 detailsHash): authorized callers only, reverts on duplicate itemId,
 *     stores detailsHash, producer (msg.sender), registeredAt (block.timestamp) and currentOwner, emits an event
 *   - a read function returning the record
 *   - NO update and NO delete functions (FR-07: confirmed entries cannot be edited)
 * Only itemId and detailsHash are supplied by the producer; no personal data or product details go on-chain
 * (NFR-04 / NFR-05).
 */
contract TraceChainStub {
    struct ItemRecord {
        bytes32 detailsHash;
        address producer;
        uint64 registeredAt;
        address currentOwner;
        bool exists;
    }

    address public immutable admin;
    mapping(address => bool) public isAuthorized;
    mapping(bytes32 => ItemRecord) private records;

    event ItemRegistered(bytes32 indexed itemId, bytes32 detailsHash, address indexed producer, uint64 registeredAt);
    event AuthorizationChanged(address indexed account, bool authorized);

    error NotAdmin();
    error NotAuthorized();
    error ItemAlreadyExists(bytes32 itemId);
    error ItemNotFound(bytes32 itemId);

    constructor() {
        admin = msg.sender;
    }

    function setAuthorized(address account, bool authorized) external {
        if (msg.sender != admin) revert NotAdmin();
        isAuthorized[account] = authorized;
        emit AuthorizationChanged(account, authorized);
    }

    function register(bytes32 itemId, bytes32 detailsHash) external {
        if (!isAuthorized[msg.sender]) revert NotAuthorized();
        if (records[itemId].exists) revert ItemAlreadyExists(itemId);
        records[itemId] = ItemRecord({
            detailsHash: detailsHash,
            producer: msg.sender,
            registeredAt: uint64(block.timestamp),
            currentOwner: msg.sender,
            exists: true
        });
        emit ItemRegistered(itemId, detailsHash, msg.sender, uint64(block.timestamp));
    }

    function getItem(bytes32 itemId)
        external
        view
        returns (bytes32 detailsHash, address producer, uint64 registeredAt, address currentOwner, bool exists)
    {
        ItemRecord storage r = records[itemId];
        return (r.detailsHash, r.producer, r.registeredAt, r.currentOwner, r.exists);
    }
}
