// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
 
contract TraceChain {
    address public administrator;
 
    struct Batch {
        address custodian;
        address pendingRecipient;
        bool exists;
        bool recalled;
    }
 
    mapping(address => bool) public authorizedParticipants;
    mapping(string => Batch) private batches;
 
    constructor() {
        administrator = msg.sender;
        authorizedParticipants[msg.sender] = true;
    }
 
    modifier onlyAdministrator() {
        require(msg.sender == administrator, "Administrator only");
        _;
    }
 
    function authorizeParticipant(address participant)
        public onlyAdministrator
    {
        authorizedParticipants[participant] = true;
    }
 
    function createBatch(string memory batchId) public {
        require(authorizedParticipants[msg.sender], "Unauthorized participant");
        require(!batches[batchId].exists, "Batch already exists");
        batches[batchId] = Batch({
            custodian: msg.sender,
            pendingRecipient: address(0),
            exists: true,
            recalled: false
        });
    }
 
    function requestTransfer(string memory batchId, address recipient) public {
        Batch storage batch = batches[batchId];
        require(batch.exists, "Batch not found");
        require(!batch.recalled, "Batch recalled");
        require(batch.custodian == msg.sender, "Current custodian only");
        require(authorizedParticipants[recipient], "Recipient not authorized");
        require(batch.pendingRecipient == address(0), "Transfer already pending");
        batch.pendingRecipient = recipient;
    }
 
    function acceptTransfer(string memory batchId) public {
        Batch storage batch = batches[batchId];
        require(!batch.recalled, "Batch recalled");
        require(batch.pendingRecipient == msg.sender, "Intended recipient only");
        batch.custodian = msg.sender;
        batch.pendingRecipient = address(0);
    }
 
    function recallBatch(string memory batchId) public {
        require(batches[batchId].exists, "Batch not found");
        require(
            batches[batchId].custodian == msg.sender || msg.sender == administrator,
            "Not authorized to recall"
        );
        batches[batchId].recalled = true;
    }
 
    function getBatch(string memory batchId)
        public view
        returns (address, address, bool, bool)
    {
        Batch memory batch = batches[batchId];
        return (
            batch.custodian,
            batch.pendingRecipient,
            batch.exists,
            batch.recalled
        );
    }
}
