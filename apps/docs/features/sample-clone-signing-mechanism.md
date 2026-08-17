# Sample Clone Signing Mechanism — R2 Gate for Tier D

> **Author:** VaultAPI + OpsCI · **Date:** 2026-08-17T14:00Z  
> **Status:** DESIGN — pending Main + Review54 approval before any user signing. All claims TESTNET-keyed; factory remains DARK until Tier D PASS.

---

## 1. Rationale

Tier D requires P-1/P-2 code identity & lineage proofs at a clone deployed after `B_pin`. The only way to have a verifiable clone is via live deployment: sign a `deployToken()` call that bonds 0.01 ETH (same flow as production launch, but testnet only). This doc describes the **mechanism** — how we prepare calldata, what gates protect the operator, and how we record evidence for G4 readback.

**Claim discipline:** all tests remain on Base Sepolia 84532 + Robinhood 46630 (TESTNET). Factory stays DARK — this exercise is rehearsal evidence only.

---

## 2. Parameters Spec (from VaultAPI submission)

`deployToken(address owner, uint16 totalFeeBps, uint256 bondAmountWei, address[] recipients, uint16[] shares)`

| Parameter | Value | Notes |
|---|---|---|
| `name` | `Kryptr Tier D Sample` | ERC20-like symbol field (token naming) |
| `symbol` | `KTD1` | Short identifier |
| `totalSupply` | 1M | Fixed supply for testing |
| `totalFeeBps` | 175 | Sum of shares = 100+40+20+15 |
| `bondAmountWei` | `10^16` (0.01 ETH) | Frozen constant, identical to factory constructor |
| `recipients` | `[pinnedSender, pinnedSender, pinnedSender, pinnedSender]` | Same wallet four times for even split |
| `shares` | `[100, 40, 20, 15]` | BPS distribution |

Calldata length: 1099 hex chars. Keccak256 computed offline sebelum display → compare vs published hash.

---

## 3. Six-Gate Validation Structure

**Fail-closed default:** ANY mismatch → REJECT immediately; never broadcast partial/invalid tx. No key access; wallet must sign manually.

### Gate 1: Balance ≥ Bond + Gas Headroom
```javascript
const EXPECTED_BOND_WEI = "0x2386F26FC10000"; // 10^16 wei
const GAS_HEADROOM_ETHER = 0.002; // 0.002 ETH buffer
const balanceWei = await provider.getBalance(signerAddress);
const requiredWei = BigInt(EXPECTED_BOND_WEI) + gasEstimate * maxFeePerGas;
if (balanceWei < requiredWei) return REJECT("Insufficient balance");
```

### Gate 2: Exact-To Factory Address Per Chain
```javascript
const FACTORY_ADDRS = {
  "84532": "0xd3153acff69909e5844130B4735feb7525750A5B",
  "46630": "0xd3153acff69909e5844130B4735feb7525750A5B" // same deterministic address
};
const expectedTo = FACTORY_ADDRS[chainId];
if (txParams.to !== expectedTo) return REJECT("Wrong factory address");
```

### Gate 3: Exact-Value Bond Wei
```javascript
if (txParams.value !== EXPECTED_BOND_WEI) return REJECT("Value mismatch (must be exactly 0.01 ETH)");
```

### Gate 4: Pre-Sign Keccak256 Commitment
- Compute keccak256(data) locally dari payload params.
- Display keccak hash TO user BEFORE asking untuk sign.
- Post-broadcast verify: hash(tx.input) == published keccak.

### Gate 5: Live Nonce Check
- Fetch nonce signer via `eth_getTransactionCount(signerAddress, latest)`.
- ExpectedNonce = 2 di kedua chain (template deploy = tx0, factory deploy = tx1).
- Abort if nonce ≠ 2 (protect against stale/replay attacks).

### Gate 6: Account Ownership Verification
- Verify `signerAddress === provider.call({to: null, data: "0x"})` checksum match.
- Reject jika alamat tidak valid atau mismatch dengan connected wallet.

---

## 4. Failure Semantics

- Any gate fails → console displays error + aborts immediately.
- No signature request sent to wallet.
- Transcript logged: `REJECT_reason`, `timestamp`, `chainId`, `expected_value`.

---

## 5. Workflow Summary

1. User load ceremony payload (JSON) containing template params.
2. Console compute keccak256(data) + display untuk verifikasi offline.
3. Operator review semua 6 gates; semua hijau → proceed ke MetaMask.
4. MetaMask prompt: send to `0xd3153acf…`, value 0.01 ETH.
5. Broadcast → post-broadcast verify via CI (P3 hash compare + receipt checks).
6. Evidence record: `B_clone` block number saat deploy, TX hash, verified_at timestamp.

---

## 6. Evidence Discipline

Record untuk artifact G5 assembly:
- `chain`: base-sepolia / robinhood-testnet
- `b_clone`: block number where clone deployed (setelah tx berhasil)
- `clone_tx`: tx hash sample clone deployment
- `p1_p2_verdict`: code identity @ B_clone vs tag artifact (read-only readback nanti)
- `p5_verification`: Blockscout API v2 poll is_verified status (binding clause: is_verified==true ONLY)

All claims TESTNET-keyed; no mainnet claims anywhere.

---

## 7. Security Notes

- **Keyless:** private keys never touch agent/CV/wallet extension injection.
- **Zero deps:** console extension self-contained, zero network fetch, zero analytics (per pattern #116 reviewed).
- **Fail-closed:** strict validation before any tx request.
- **Immutable constants:** fee/bond/sink values hardcoded from frozen vocabulary (re-use runbook §9 constants).

---

## 8. Open Questions for Review54

1. Apakah six-gate structure cukup ketat untuk clone deploy?
2. Apakah perlu additional pre-check (gas limit verification) sebagai seventh gate?
3. Konfirmasi binding clause P-5 assertion (is_verified==true literal) dalam design ini.
