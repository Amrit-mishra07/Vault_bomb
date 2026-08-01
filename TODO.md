# 💣 Vault_bomb — Hackathon TODO

---

## Recommended Demo Path

**Make this single flow bulletproof first:** Connect wallet → Type evidence text → Click "Encrypt & Arm Switch" → Watch the Lit Simulator terminal show the key being secured → Switch to the Watcher tab → See the new switch appear as "ARMED" → Wait for the heartbeat window to expire → Click `triggerRelease()` from the Watcher tab acting as a bot → Watch the Lit Simulator terminal decrypt and "publish" the evidence → Switch status flips to "RELEASED." This is a ~3 minute live walkthrough that tells the entire story. Every Tier 0 and Tier 2 item below exists to make this exact sequence work end-to-end without a single error or awkward pause.

---

## TIER 0 — DEMO BLOCKERS (must fix or the demo fails/crashes)

- [ ] **Fix `register_switch()` ABI mismatch between frontend and contract**
  - Files: [App.tsx L7](file:///home/harshsys_hypr/Vault_bomb/frontend/src/App.tsx#L7) vs [lib.rs L48](file:///home/harshsys_hypr/Vault_bomb/contracts/src/lib.rs#L48)
  - The contract expects 6 params (`uint256, uint256, string, bytes32, address, address`) but the frontend ABI declares 4 (`uint256, string, bytes32, address`). The function selector won't match, and registration will revert on-chain every time. The demo cannot start.
  - **Effort: S**

- [ ] **Fix `heartbeat()` ABI mismatch between frontend and contract**
  - Files: [App.tsx L8](file:///home/harshsys_hypr/Vault_bomb/frontend/src/App.tsx#L8) vs [lib.rs L92](file:///home/harshsys_hypr/Vault_bomb/contracts/src/lib.rs#L92)
  - The contract expects `heartbeat(address, uint256)` but the frontend ABI declares `heartbeat()` with zero params. The heartbeat button — the journalist's core lifeline — is completely non-functional.
  - **Effort: S**

- [ ] **Update `handleHeartbeat()` to pass journalist address and an incrementing nonce**
  - File: [App.tsx L125–141](file:///home/harshsys_hypr/Vault_bomb/frontend/src/App.tsx#L125-L141)
  - Even after fixing the ABI, the function body calls `contract.heartbeat()` with no arguments. It needs to pass `(account, nonce)`. Store a nonce counter in React state and increment it on each call.
  - **Effort: S**

- [ ] **Update `handleRegister()` to pass all 6 contract parameters**
  - File: [App.tsx L102–108](file:///home/harshsys_hypr/Vault_bomb/frontend/src/App.tsx#L102-L108)
  - Currently passes 4 args. Must also pass `grace_period_blocks` (can default to `0` or `10` for the demo) and `backup_wallet` (can default to `ethers.ZeroAddress`).
  - **Effort: S**

- [ ] **Replace hardcoded zero address with actual deployed contract address**
  - File: [App.tsx L5](file:///home/harshsys_hypr/Vault_bomb/frontend/src/App.tsx#L5)
  - `CONTRACT_ADDRESS = "0x000...000"` means every transaction goes to the burn address. Nothing works until this points to a real deployed contract.
  - **Effort: S** (but depends on deploying the contract first — see next item)

- [ ] **Deploy the Stylus contract to Arbitrum Sepolia and record the address**
  - File: [deploy.sh](file:///home/harshsys_hypr/Vault_bomb/contracts/deploy.sh)
  - Prerequisites: fund a deployer wallet with Arbitrum Sepolia ETH, create a `.env` with `PRIVATE_KEY`, run `cargo stylus check` then `cargo stylus deploy`. Record the contract address and paste it into the frontend.
  - **Effort: M**

- [ ] **Create a `.env` file for the Lit Simulator with `CONTRACT_ADDRESS`**
  - File: [lit-simulator/index.js L47–48](file:///home/harshsys_hypr/Vault_bomb/lit-simulator/index.js#L47-L48)
  - Without `CONTRACT_ADDRESS` in the environment, the event listener is never created (`if (CONTRACT_ADDRESS)` is falsy), so the simulator will never react to trigger events. The release half of the demo is dead.
  - **Effort: S**

- [ ] **Ensure the Lit Simulator and Frontend are on the same deployed contract address**
  - Files: [App.tsx L5](file:///home/harshsys_hypr/Vault_bomb/frontend/src/App.tsx#L5), [lit-simulator/.env]
  - Both must point to the same Arbitrum Sepolia contract. If they're out of sync, the simulator listens on a different contract than the one the frontend is writing to, and the trigger event is never caught.
  - **Effort: S**

---

## TIER 1 — CORE LOGIC BUGS (wrong behavior, but doesn't crash)

- [ ] **`claim_bounty()` does not actually transfer ETH — bounty is permanently locked**
  - File: [lib.rs L196–211](file:///home/harshsys_hypr/Vault_bomb/contracts/src/lib.rs#L196-L211)
  - The function emits `BountyClaimed` but never sends ETH. For the demo, this is acceptable (the event log tells the story), but if you demo the bounty claim step, note that the bot's wallet balance won't actually change. Consider adding a comment or UI note: "ETH transfer simulated for demo."
  - **Effort: M** (to actually implement the transfer) / **S** (to add a "simulated" label)

- [ ] **`lit_proof` validation is a stub — any non-empty bytes pass**
  - File: [lib.rs L192–194](file:///home/harshsys_hypr/Vault_bomb/contracts/src/lib.rs#L192-L194)
  - A malicious caller can claim the bounty with `0x01` without publishing anything. For a hackathon demo where you control both sides, this won't visibly break. But if a judge asks "what stops someone from stealing the bounty without publishing?", you need a good answer. Consider at least mentioning the `lit_action_pubkey` field and ecrecover in your pitch.
  - **Effort: L** (real fix) / **S** (acknowledge in pitch notes)

- [ ] **Duress heartbeat path does not update `last_nonce`**
  - File: [lib.rs L108–118](file:///home/harshsys_hypr/Vault_bomb/contracts/src/lib.rs#L108-L118)
  - Minor inconsistency. The duress wallet triggers release without updating the nonce. Functionally harmless since the switch is terminal after trigger, but a sharp reviewer might notice.
  - **Effort: S**

- [ ] **One switch per address — no re-registration possible**
  - File: [lib.rs L62–64](file:///home/harshsys_hypr/Vault_bomb/contracts/src/lib.rs#L62-L64)
  - `is_active` is set to `true` at registration and never reset. If you demo twice from the same wallet, the second attempt reverts. **Workaround for demo day:** use a fresh wallet for each demo run, or add a comment explaining this is by design.
  - **Effort: S** (workaround) / **M** (real fix to support re-registration after trigger)

---

## TIER 2 — MISSING MVP FEATURES (needed to tell a complete story)

- [ ] **Make the Watcher Dashboard read live on-chain data instead of showing mock data**
  - File: [App.tsx L148–154](file:///home/harshsys_hypr/Vault_bomb/frontend/src/App.tsx#L148-L154)
  - Currently shows two hardcoded fake switches when `CONTRACT_ADDRESS === "0x000..."`. Once the contract is deployed (Tier 0), remove the mock fallback and let `fetchSwitches()` read real data. This is essential — a judge clicking the Watcher tab should see the switch they just registered.
  - **Effort: S**

- [ ] **Add a UI state indicator showing the heartbeat countdown / blocks remaining**
  - File: [App.tsx](file:///home/harshsys_hypr/Vault_bomb/frontend/src/App.tsx) (Journalist Setup tab)
  - After registration, the journalist sees "Status: Armed" but has no idea how many blocks remain before the switch is eligible for triggering. Add a computed display: `Blocks remaining: {windowBlocks + graceBlocks - (currentBlock - lastHeartbeatBlock)}`. This makes the demo dramatically more compelling — the audience watches a live countdown.
  - **Effort: M**

- [ ] **Wire up the `triggerRelease()` button on the Watcher to pass real journalist addresses**
  - File: [App.tsx L182–199](file:///home/harshsys_hypr/Vault_bomb/frontend/src/App.tsx#L182-L199)
  - Currently this works but only if `fetchSwitches()` returns real data (depends on removing mock data above). Verify end-to-end that clicking the trigger button on a real switch calls the contract correctly.
  - **Effort: S**

- [ ] **Add a "Lit Simulator Status" indicator to the frontend**
  - File: [App.tsx](file:///home/harshsys_hypr/Vault_bomb/frontend/src/App.tsx)
  - During the demo, the frontend silently fails if the Lit Simulator isn't running. Add a small health-check dot (green/red) that pings `http://localhost:3000` on mount. This prevents the awkward "why didn't anything happen?" moment on stage.
  - **Effort: S**

- [ ] **Show a success confirmation after Lit key storage (Step 2 of registration)**
  - File: [App.tsx L79–93](file:///home/harshsys_hypr/Vault_bomb/frontend/src/App.tsx#L79-L93)
  - Currently the status jumps from "Encrypting Evidence..." directly to "Registering Smart Contract..." with no visible confirmation that the key was secured. Add a brief status: "✔ Key secured by Lit Protocol" before proceeding.
  - **Effort: S**

- [ ] **Add a "Released Evidence" display panel to the Watcher tab**
  - File: [App.tsx](file:///home/harshsys_hypr/Vault_bomb/frontend/src/App.tsx) (Watcher tab)
  - After the trigger fires and the Lit Simulator decrypts, the audience has to look at the server terminal to see the result. Adding a panel that fetches and displays the decrypted evidence text (from the Lit Simulator via a new `GET /released/:journalist` endpoint) would make the "reveal moment" far more dramatic in the UI.
  - **Effort: M**

- [ ] **Add a `GET /released/:journalist` endpoint to the Lit Simulator**
  - File: [lit-simulator/index.js](file:///home/harshsys_hypr/Vault_bomb/lit-simulator/index.js)
  - Store the released plaintext in the `litKeyStore` Map after decryption and expose it via a GET endpoint. The frontend Watcher can then fetch and display the evidence.
  - **Effort: S**

---

## TIER 3 — POLISH & UX (makes it look credible, not required to function)

- [ ] **Add network validation — prompt user to switch to Arbitrum Sepolia if on the wrong chain**
  - File: [App.tsx `connectWallet()`](file:///home/harshsys_hypr/Vault_bomb/frontend/src/App.tsx#L30-L42)
  - If MetaMask is on Ethereum mainnet, all transactions will fail with confusing errors. After connecting, check `provider.getNetwork().chainId` and use `wallet_switchEthereumChain` or `wallet_addEthereumChain` to prompt a switch.
  - **Effort: S**

- [ ] **Add a transaction explorer link after each successful transaction**
  - File: [App.tsx](file:///home/harshsys_hypr/Vault_bomb/frontend/src/App.tsx) — `handleRegister()`, `handleHeartbeat()`, `handleBotTrigger()`
  - After `tx.wait()`, show a clickable link to `https://sepolia.arbiscan.io/tx/{tx.hash}`. This is a standard dApp UX and makes the demo feel professional.
  - **Effort: S**

- [ ] **Replace `alert()` calls with in-page toast notifications**
  - File: [App.tsx](file:///home/harshsys_hypr/Vault_bomb/frontend/src/App.tsx) — multiple locations
  - Browser `alert()` dialogs look amateur. A simple CSS toast notification (auto-dismiss after 3s) would be much more polished.
  - **Effort: M**

- [ ] **Add better error messages for common failure modes**
  - File: [App.tsx](file:///home/harshsys_hypr/Vault_bomb/frontend/src/App.tsx) — all `catch` blocks
  - Parse revert reasons from ethers.js errors (e.g., "Already registered", "Window not expired") and display them in plain English instead of raw error dumps.
  - **Effort: S**

- [ ] **Add a "How It Works" explainer section or modal to the UI**
  - File: [App.tsx](file:///home/harshsys_hypr/Vault_bomb/frontend/src/App.tsx)
  - A collapsible section or info icon with a 3-step summary ("1. Encrypt → 2. Heartbeat → 3. Release") would help judges who land on the page cold.
  - **Effort: S**

- [ ] **Add a pulsing "LIVE" indicator next to the block number on the Watcher dashboard**
  - File: [App.tsx](file:///home/harshsys_hypr/Vault_bomb/frontend/src/App.tsx) (Watcher tab)
  - Display the current Arbitrum block number updating in real-time. This reassures the audience that the app is connected to a live blockchain.
  - **Effort: S**

- [ ] **Add mobile-responsive CSS breakpoints**
  - File: [index.css](file:///home/harshsys_hypr/Vault_bomb/frontend/src/index.css)
  - Currently uses `max-width: 700px` with no media queries. If a judge opens the demo on a phone or tablet, layout may break.
  - **Effort: S**

- [ ] **Add disconnect/switch-account handling for MetaMask**
  - File: [App.tsx](file:///home/harshsys_hypr/Vault_bomb/frontend/src/App.tsx)
  - Listen for `accountsChanged` and `chainChanged` events on `window.ethereum`. Update UI state accordingly.
  - **Effort: S**

---

## TIER 4 — CODE QUALITY / NITPICKS (safe to skip for the hackathon)

- [ ] **Move contract address to an environment variable (`import.meta.env.VITE_CONTRACT_ADDRESS`)**
  - File: [App.tsx L5](file:///home/harshsys_hypr/Vault_bomb/frontend/src/App.tsx#L5)
  - Cleaner than hardcoding. Not visible to judges.
  - **Effort: S**

- [ ] **Create a `.env.example` file documenting all required env vars**
  - Files: `contracts/.env.example`, `lit-simulator/.env.example`
  - Documents `PRIVATE_KEY`, `CONTRACT_ADDRESS`, `RPC_URL`, `PORT`. Helps teammates and reviewers.
  - **Effort: S**

- [ ] **Add NatSpec/doc comments to all public contract functions**
  - File: [lib.rs](file:///home/harshsys_hypr/Vault_bomb/contracts/src/lib.rs)
  - Standard practice for smart contracts. Only matters if judges read the source.
  - **Effort: S**

- [ ] **Extract ABI into a separate `abi.ts` or `constants.ts` file**
  - File: [App.tsx L6–14](file:///home/harshsys_hypr/Vault_bomb/frontend/src/App.tsx#L6-L14)
  - Keeps the component file cleaner. Pure code organization.
  - **Effort: S**

- [ ] **Add TypeScript interfaces for switch data instead of `any[]`**
  - File: [App.tsx L28](file:///home/harshsys_hypr/Vault_bomb/frontend/src/App.tsx#L28)
  - `useState<any[]>([])` loses type safety. Define a `SwitchInfo` interface.
  - **Effort: S**

- [ ] **Remove the `React` import in `main.tsx` (not needed in React 19 with the new JSX transform)**
  - File: [main.tsx L1](file:///home/harshsys_hypr/Vault_bomb/frontend/src/main.tsx#L1)
  - Harmless but unnecessary.
  - **Effort: S**

- [ ] **Add `clippy` linting to the Rust contract and fix any warnings**
  - File: [contracts/](file:///home/harshsys_hypr/Vault_bomb/contracts)
  - Standard Rust quality practice.
  - **Effort: S**

---

## TIER 5 — POST-HACKATHON / OUT OF SCOPE

- [ ] **Implement real ETH transfer in `claim_bounty()` using Stylus raw call**
  - Deferred because Stylus value-transfer is verbose and requires testnet funding.

- [ ] **Implement real `ecrecover` signature verification for `lit_proof`**
  - Deferred because it requires setting up the Lit Protocol threshold key infrastructure.

- [ ] **Migrate from Lit Simulator to real Lit Protocol Datil testnet**
  - Deferred because end-to-end Lit Action setup (IPFS-deployed JS, PKP minting, ACC configuration) is a multi-day effort.

- [ ] **Implement real Arweave uploads (via Irys/Bundlr SDK)**
  - Deferred because it requires AR token funding and SDK integration.

- [ ] **Add file upload support (photos, videos, ZIP archives) to the frontend**
  - Deferred because the text-only demo is sufficient to demonstrate the concept.

- [ ] **Add support for multiple switches per wallet address**
  - Deferred. Current 1-switch-per-wallet design is adequate for the demo.

- [ ] **Add a switch cancellation / cooling-off period mechanism**
  - Deferred. Deliberate design trade-off (immutability as a feature). Acknowledged but not needed for MVP.

- [ ] **Fix unbounded loop in `check_upkeep()` — add pagination**
  - File: [lib.rs L222–237](file:///home/harshsys_hypr/Vault_bomb/contracts/src/lib.rs#L222-L237)
  - Only matters at scale (hundreds of registered journalists). Demo will have 1–3.

- [ ] **Add key persistence to the Lit Simulator (write keys to disk or SQLite)**
  - Deferred. In-memory Map is fine for a live demo that runs continuously.

- [ ] **Add authentication to the `/store-key` endpoint**
  - Deferred. Localhost-only demo; not reachable from the internet.

- [ ] **Add WebSocket reconnection logic to the Lit Simulator event listener**
  - Deferred. Public RPC connections are stable enough for a 5-minute demo.

- [ ] **Add HTTPS to the Lit Simulator**
  - Deferred. Running on localhost; no real key material at risk on testnet.

- [ ] **Write smart contract unit tests (`#[test]` with stylus-sdk test utilities)**
  - Deferred. Tests are critical for production but not for a hackathon demo.

- [ ] **Write frontend tests (React Testing Library, Cypress E2E)**
  - Deferred.

- [ ] **Implement L1 force-inclusion path for `triggerRelease()` to bypass sequencer censorship**
  - Deferred. Advanced feature from the Phase 2 roadmap.

- [ ] **Set up CI/CD pipeline (GitHub Actions)**
  - Deferred.

- [ ] **Add rate limiting / spam prevention for `register_switch()`**
  - Deferred. Phase 3 roadmap item.

- [ ] **Commission formal security audit**
  - Deferred. Phase 2 roadmap item.

- [ ] **Deploy Watcher Dashboard to IPFS for censorship resistance**
  - Deferred. Nice narrative point but not needed for a live demo on localhost.

- [ ] **Add multi-chain support (mainnet deployment)**
  - Deferred. Testnet is appropriate for hackathon scope.

---

## Cut List

The following items were identified in the full [PROJECT_EXPLAINER.md](file:///home/harshsys_hypr/Vault_bomb/PROJECT_EXPLAINER.md) analysis but are **consciously deferred** — not forgotten, not missed:

| Item | Reason for deferral |
|---|---|
| Real ETH transfer in `claim_bounty()` | Stylus transfer is verbose; event log tells the story for demo |
| Real `ecrecover` proof verification | Requires Lit Protocol threshold key infra |
| Real Lit Protocol integration | Multi-day effort; simulator demonstrates the concept |
| Real Arweave uploads | Requires AR tokens and SDK integration |
| File upload UI (photos/videos) | Text demo is sufficient to prove the concept |
| Multiple switches per wallet | 1-switch-per-wallet is fine for demo |
| Switch cancellation mechanism | Deliberate immutability design choice |
| `check_upkeep()` pagination | Only matters at scale; demo has 1–3 switches |
| Lit Simulator key persistence | In-memory is fine for continuous demo session |
| `/store-key` authentication | Localhost only; not internet-facing |
| Event listener reconnection | Stable enough for a 5-minute demo |
| HTTPS on Lit Simulator | Localhost; testnet keys have no real value |
| Smart contract tests | Not needed for hackathon demo |
| Frontend tests | Not needed for hackathon demo |
| L1 force-inclusion | Phase 2 advanced feature |
| CI/CD pipeline | Not needed for hackathon |
| Spam prevention | Phase 3 feature |
| Formal security audit | Phase 2 feature |
| IPFS deployment of Watcher | Nice-to-have narrative; localhost demo is fine |
| Mainnet deployment | Testnet is correct scope |
