# Dead-Man's Switch — Build Todo List

Companion to `deadmans_switch_technical_spec.md`. Organized by phase, matching the phased delivery plan in §9 of the spec.

---

## Phase 1 — MVP (Stylus contract + basic automation)

### Contract
- [ ] Scaffold Stylus contract in Rust using the `stylus-sdk` — start from `cargo stylus new`
- [ ] Implement `registerSwitch()`: stores heartbeat window, grace period, Arweave txID, SHA-256 hash, TEE address, registered/backup/duress wallets
- [ ] Implement `heartbeat(nonce)`: `msg.sender` check against registered/backup wallet, strictly-increasing nonce for replay protection
- [ ] Implement duress-wallet path: heartbeat from duress wallet immediately flips state to `TRIGGERED`
- [ ] Implement `triggerRelease()` as a public, permissionless function gated only by an on-chain time/block check (window + grace elapsed) — no access control beyond that
- [ ] Make the winning `triggerRelease()` caller state transition idempotent (first valid call wins, later calls cheaply revert)
- [ ] Write the bounty escrow logic: funded at `registerSwitch()`, paid to `msg.sender` of the winning `triggerRelease()` call
- [ ] No proxy, no admin key, no pause function — verify this by code review before every deploy
- [ ] Deploy to Arbitrum Sepolia testnet, verify source on Arbiscan

### Automation
- [ ] Write Chainlink Upkeep-compatible `checkUpkeep()` / `performUpkeep()` interface on the contract
- [ ] Register a Chainlink Upkeep job pointing at the contract; fund with a LINK buffer
- [ ] Register a Gelato task as the second automated keeper

### Client
- [ ] Build a minimal client (CLI or simple web app) for: AES encryption, Arweave upload, TEE key transmission, contract registration — implementing the three-phase commit order from spec §5.1
- [ ] Client-side: poll for heartbeat tx inclusion (not just submission), alert on revert

### TEE custody
- [ ] Deploy a single TEE instance on EigenCloud; implement sealed-disk key persistence (not memory-only) and test enclave-restart recovery explicitly
- [ ] TEE listens for `TRIGGERED` event, fetches ciphertext from Arweave, verifies SHA-256 hash before decrypting, publishes plaintext back to Arweave

---

## Phase 1.5 — Publication & discovery

### Lit Actions / publication
- [ ] Prototype Lit Actions: write the JS release-logic function (checks Stylus contract `TRIGGERED` state as its access-control condition, decrypts, publishes)
- [ ] Mint a PKP and bind it to the Lit Action (mint/grant/burn pattern) so the key is permanently locked to that logic
- [ ] Implement multi-channel publish inside the Lit Action: Arweave, Twitter/X bot, Telegram/Signal, email list, Farcaster (via Neynar/a hub), Lens
- [ ] Store bot credentials (Twitter/Telegram API keys) inside the Lit Action's execution context, gated by the same trigger condition — don't hardcode them client-side

### Watcher dashboard
- [ ] Build the watcher dashboard as a static, read-only site: indexes registered switches by status (active / grace / triggered), listens for `PlaintextPublished`
- [ ] Deploy the dashboard to IPFS; document how a second independent operator can mirror it

### Integration test
- [ ] End-to-end test on testnet: register → let window expire → confirm bounty payout, publish fan-out, and dashboard flip all happen correctly

---

## Phase 2 — Hardening

- [ ] Due-diligence pass on Lit Protocol's current node count/governance (flagged as open question in the spec) before committing
- [ ] If Lit checks out: migrate custody fully to Lit Actions/PKPs; if not, scope the custom multi-TEE M-of-N build as fallback
- [ ] Implement L1 force-inclusion path for `triggerRelease()` to route around Arbitrum sequencer censorship
- [ ] Commission external audit: Stylus contract, Lit Action code, three-phase-commit setup flow
- [ ] Load-test the bounty mechanism (simulate searcher competition) and tune bounty sizing

---

## Phase 3 — Field pilot

- [ ] Partner with a press freedom org for canonical-address distribution (closes the "fake lookalike contract" risk)
- [ ] Onboard first real switches, monitor LINK/Gelato funding levels in production

---

## Phase 4 — Scale

- [ ] Build B2B org tier: managed deployment, dedicated TEE/Lit nodes, SLAs
- [ ] Implement protocol registration fees
- [ ] Localize client UI for international expansion
- [ ] Secure watcher dashboard public-goods funding (Gitcoin-style, Arbitrum Foundation grant, or protocol-fee carve-out)
