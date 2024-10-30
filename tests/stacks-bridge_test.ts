;; bridge-contract_test.ts

import { 
  Chain, 
  Account, 
  Tx, 
  types, 
  assertEquals, 
  assertStringIncludes 
} from './deps.ts';

import { 
  Clarinet,
  assertEquals as clarinetAssertEquals
} from 'https://deno.land/x/clarinet@v1.0.0/index.ts';

Clarinet.test({
  name: "Ensure that contract owner is set correctly",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const wallet1 = accounts.get("wallet_1")!;

    // Try to call an owner-only function
    let block = chain.mineBlock([
      Tx.contractCall(
        "bridge-contract",
        "set-min-transfer-amount",
        [types.uint(1000000)],
        wallet1.address
      ),
    ]);

    // Assert that non-owner call fails
    block.receipts[0].result.expectErr().expectUint(100);
    
    // Try with owner
    block = chain.mineBlock([
      Tx.contractCall(
        "bridge-contract",
        "set-min-transfer-amount",
        [types.uint(1000000)],
        deployer.address
      ),
    ]);

    // Assert that owner call succeeds
    block.receipts[0].result.expectOk().expectBool(true);
  },
});

Clarinet.test({
  name: "Test initiate bridge with valid parameters",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const wallet1 = accounts.get("wallet_1")!;
    const amount = 1000000; // 1 STX
    const bnbAddress = "0x1234567890123456789012345678901234567890";

    let block = chain.mineBlock([
      Tx.contractCall(
        "bridge-contract",
        "initiate-bridge",
        [
          types.uint(amount),
          types.ascii(bnbAddress)
        ],
        wallet1.address
      ),
    ]);

    // Assert successful bridge initiation
    block.receipts[0].result.expectOk().expectUint(0); // First request should have nonce 0
    
    // Verify STX transfer occurred
    block.receipts[0].events.expectSTXTransferEvent(
      amount + 1000, // amount + fee
      wallet1.address,
      `${deployer.address}.bridge-contract`
    );
  },
});

Clarinet.test({
  name: "Test initiate bridge with insufficient funds",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const wallet1 = accounts.get("wallet_1")!;
    const amount = 1000000000000; // Very large amount
    const bnbAddress = "0x1234567890123456789012345678901234567890";

    let block = chain.mineBlock([
      Tx.contractCall(
        "bridge-contract",
        "initiate-bridge",
        [
          types.uint(amount),
          types.ascii(bnbAddress)
        ],
        wallet1.address
      ),
    ]);

    // Assert failure due to insufficient funds
    block.receipts[0].result.expectErr().expectUint(102);
  },
});

Clarinet.test({
  name: "Test bridge confirmation flow",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const wallet1 = accounts.get("wallet_1")!;
    const amount = 1000000;
    const bnbAddress = "0x1234567890123456789012345678901234567890";
    const txid = "0x9876543210987654321098765432109876543210987654321098765432109876";

    // First initiate a bridge request
    let block = chain.mineBlock([
      Tx.contractCall(
        "bridge-contract",
        "initiate-bridge",
        [
          types.uint(amount),
          types.ascii(bnbAddress)
        ],
        wallet1.address
      ),
    ]);

    // Assert bridge initiation success
    block.receipts[0].result.expectOk().expectUint(0);

    // Now confirm the bridge request
    block = chain.mineBlock([
      Tx.contractCall(
        "bridge-contract",
        "confirm-bridge",
        [
          types.uint(0), // request id
          types.ascii(txid)
        ],
        deployer.address
      ),
    ]);

    // Assert confirmation success
    block.receipts[0].result.expectOk().expectBool(true);

    // Try to confirm same transaction again
    block = chain.mineBlock([
      Tx.contractCall(
        "bridge-contract",
        "confirm-bridge",
        [
          types.uint(0),
          types.ascii(txid)
        ],
        deployer.address
      ),
    ]);

    // Assert failure due to already processed
    block.receipts[0].result.expectErr().expectUint(103);
  },
});

Clarinet.test({
  name: "Test pause functionality",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const wallet1 = accounts.get("wallet_1")!;
    const amount = 1000000;
    const bnbAddress = "0x1234567890123456789012345678901234567890";

    // First pause the contract
    let block = chain.mineBlock([
      Tx.contractCall(
        "bridge-contract",
        "toggle-pause",
        [],
        deployer.address
      ),
    ]);

    // Assert pause success
    block.receipts[0].result.expectOk().expectBool(true);

    // Try to initiate bridge while paused
    block = chain.mineBlock([
      Tx.contractCall(
        "bridge-contract",
        "initiate-bridge",
        [
          types.uint(amount),
          types.ascii(bnbAddress)
        ],
        wallet1.address
      ),
    ]);

    // Assert failure due to pause
    block.receipts[0].result.expectErr().expectUint(104);

    // Unpause and try again
    block = chain.mineBlock([
      Tx.contractCall(
        "bridge-contract",
        "toggle-pause",
        [],
        deployer.address
      ),
      Tx.contractCall(
        "bridge-contract",
        "initiate-bridge",
        [
          types.uint(amount),
          types.ascii(bnbAddress)
        ],
        wallet1.address
      ),
    ]);

    // Assert success after unpause
    block.receipts[1].result.expectOk().expectUint(0);
  },
});

Clarinet.test({
  name: "Test fee withdrawal",
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get("deployer")!;
    const wallet1 = accounts.get("wallet_1")!;
    const amount = 1000000;
    const bnbAddress = "0x1234567890123456789012345678901234567890";

    // First make a bridge request to accumulate some fees
    let block = chain.mineBlock([
      Tx.contractCall(
        "bridge-contract",
        "initiate-bridge",
        [
          types.uint(amount),
          types.ascii(bnbAddress)
        ],
        wallet1.address
      ),
    ]);

    // Assert bridge initiation success
    block.receipts[0].result.expectOk().expectUint(0);

    // Now withdraw fees
    block = chain.mineBlock([
      Tx.contractCall(
        "bridge-contract",
        "withdraw-fees",
        [],
        deployer.address
      ),
    ]);

    // Assert withdrawal success
    block.receipts[0].result.expectOk().expectBool(true);
    
    // Verify STX transfer event for fee withdrawal
    block.receipts[0].events.expectSTXTransferEvent(
      amount + 1000, // full amount including fee
      `${deployer.address}.bridge-contract`,
      deployer.address
    );
  },
});