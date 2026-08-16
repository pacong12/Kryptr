// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {LaunchTestBase} from "./utils/LaunchTestBase.t.sol";

/// @notice Selector-surface gate (T21 G4 P-3, wave5-t21-verification-design.md
///         §7.1 as finalized in Web3Intel PR #72). The fixture stores SIGNATURE
///         STRINGS; 4-byte selectors are derived via keccak here — no hardcoded
///         hex. Enforcement is allowlist-primary: the PUSH4 dispatcher scan of
///         each deployed contract must EXACTLY equal allowlisted function
///         selectors ∪ custom-error selectors; anything else is NO-GO. The
///         forbidden set (T21 §9.3 final) is asserted as belt-and-braces and as
///         the stable consent vocabulary, plus a behavioral probe: every
///         forbidden selector must revert (no fallback/receive anywhere).
contract SelectorSurfaceTest is LaunchTestBase {
    address internal token;

    function setUp() public override {
        super.setUp();
        token = deployDefault();
    }

    // ------------------------------------------------------------- fixtures

    function factoryFunctions() internal pure returns (string[] memory s) {
        s = new string[](10);
        s[0] =
            "deployToken((string,string,uint256,uint256,uint16,uint16,uint16,uint16,address,address,address,address))";
        s[1] =
            "deploySalt(address,(string,string,uint256,uint256,uint16,uint16,uint16,uint16,address,address,address,address))";
        s[2] =
            "predictTokenAddress(address,(string,string,uint256,uint256,uint16,uint16,uint16,uint16,address,address,address,address))";
        s[3] = "template()";
        s[4] = "totalFeeBps()";
        s[5] = "bondAmount()";
        s[6] = "bondSink()";
        s[7] = "totalBondsCollected()";
        s[8] = "bondsByDeployer(address)";
        s[9] = "FACTORY_VERSION()";
    }

    function factoryErrors() internal pure returns (string[] memory s) {
        s = new string[](12);
        s[0] = "BondMismatch()";
        s[1] = "ScheduleSumInvalid()";
        s[2] = "RecipientZero()";
        s[3] = "TokenNameInvalid()";
        s[4] = "TokenSymbolInvalid()";
        s[5] = "SupplyZero()";
        s[6] = "TemplateInvalid()";
        s[7] = "RateInvalid()";
        s[8] = "BondAmountZero()";
        s[9] = "SinkZero()";
        s[10] = "CloneCreationFailed()";
        s[11] = "SinkTransferFailed()";
    }

    function templateFunctions() internal pure returns (string[] memory s) {
        s = new string[](18);
        s[0] = "name()";
        s[1] = "symbol()";
        s[2] = "decimals()";
        s[3] = "totalSupply()";
        s[4] = "balanceOf(address)";
        s[5] = "allowance(address,address)";
        s[6] = "transfer(address,uint256)";
        s[7] = "approve(address,uint256)";
        s[8] = "transferFrom(address,address,uint256)";
        s[9] =
            "initialize((string,string,uint256,address,uint16,uint16,uint16,uint16,uint16,address,address,address,address))";
        s[10] = "creatorFeeBps()";
        s[11] = "lpFeeBps()";
        s[12] = "protocolFeeBps()";
        s[13] = "buybackFeeBps()";
        s[14] = "creatorRecipient()";
        s[15] = "lpRecipient()";
        s[16] = "protocolRecipient()";
        s[17] = "buybackRecipient()";
    }

    function templateErrors() internal pure returns (string[] memory s) {
        s = new string[](8);
        s[0] = "AlreadyInitialized()";
        s[1] = "InitNameInvalid()";
        s[2] = "InitSymbolInvalid()";
        s[3] = "InitSupplyZero()";
        s[4] = "InitDeployerZero()";
        s[5] = "InitFeeScheduleInvalid()";
        s[6] = "InitRecipientZero()";
        s[7] = "ZeroAddress()";
    }

    /// T21 §9.3 final forbidden set (Web3Intel PR #72 §7.1): A upgrade/proxy,
    /// B destruction, C ownership/authority, D frozen-param setters,
    /// E flow-control, F value extraction, G supply mutators.
    function forbiddenSignatures() internal pure returns (string[] memory s) {
        s = new string[](49);
        // A. upgrade/proxy control
        s[0] = "upgradeTo(address)";
        s[1] = "upgradeToAndCall(address,bytes)";
        s[2] = "upgrade(address)";
        s[3] = "changeAdmin(address)";
        s[4] = "admin()";
        s[5] = "implementation()";
        s[6] = "proxiableUUID()";
        // B. destruction
        s[7] = "kill()";
        s[8] = "destroy()";
        s[9] = "selfdestruct()";
        // C. ownership/authority
        s[10] = "transferOwnership(address)";
        s[11] = "renounceOwnership()";
        s[12] = "owner()";
        s[13] = "setOwner(address)";
        s[14] = "setAuthority(address)";
        s[15] = "acceptOwnership()";
        s[16] = "pendingOwner()";
        s[17] = "grantRole(bytes32,address)";
        s[18] = "revokeRole(bytes32,address)";
        s[19] = "renounceRole(bytes32,address)";
        s[20] = "setDefaultAdminDelay(uint256)";
        s[21] = "changeDefaultAdminDelay(uint256)";
        // D. frozen-param setters
        s[22] = "setFee(uint256)";
        s[23] = "setFeeBps(uint256)";
        s[24] = "setTotalFeeBps(uint256)";
        s[25] = "setBondAmount(uint256)";
        s[26] = "setBondSink(address)";
        s[27] = "setRecipients(address[4])";
        s[28] = "setSupply(uint256)";
        // E. flow-control mutators
        s[29] = "pause()";
        s[30] = "unpause()";
        s[31] = "setPaused(bool)";
        s[32] = "blacklist(address)";
        s[33] = "unBlacklist(address)";
        s[34] = "freeze(address)";
        s[35] = "unfreeze(address)";
        s[36] = "setMaxTxAmount(uint256)";
        s[37] = "setMaxWallet(uint256)";
        // F. value extraction
        s[38] = "withdraw()";
        s[39] = "withdraw(address,uint256)";
        s[40] = "withdrawETH(address)";
        s[41] = "rescueTokens(address,address,uint256)";
        s[42] = "sweep(address)";
        s[43] = "recoverERC20(address,uint256)";
        s[44] = "claimBond()";
        // G. supply mutators
        s[45] = "mint(address,uint256)";
        s[46] = "burn(uint256)";
        s[47] = "burnFrom(address,uint256)";
        // structural extras: common admin-ish spellings outside the doc list
        s[48] = "setFeeRecipients(address[4])";
    }

    /// PUSH4 constants present in the bytecode that are NOT dispatchable
    /// selectors — verified compiler artifacts (provenance below; each is
    /// additionally proven non-dispatchable by the automatic behavioral probe
    /// in _assertExactSurface, so this classification never carries the safety
    /// burden alone). ABI-level ground truth: `forge inspect <C>
    /// method-identifiers`/`errors` equals the fixtures above EXACTLY.
    ///   - keccak("Panic(uint256)")[:4]: the compiler's checked-arithmetic
    ///     panic error (derived, not hardcoded).
    ///   - initialize(...) signature: external call TARGET referenced by the
    ///     factory (derived from the expanded canonical signature).
    ///   - uint16/uint32 cleaning masks (derived from the type bounds).
    ///   - shl(0xe1, ·) constant-synthesis operands (optimizer immediates,
    ///     observed via `forge inspect asm`; not derivable from signatures —
    ///     flagged as the sole hex-recorded exception class, each probed).
    function nonSelectorPush4s(bool isFactory) internal pure returns (bytes4[] memory a) {
        a = isFactory ? new bytes4[](6) : new bytes4[](5);
        a[0] = bytes4(keccak256("Panic(uint256)"));
        uint256 i = 1;
        if (isFactory) {
            // cross-contract call target (template's exactly-once initializer)
            a[i++] = bytes4(keccak256(bytes(templateInitSignature())));
            a[i++] = bytes4(type(uint32).max); // uint32 cleaning mask
            // shl(0xe1) synthesis operands (asm-verified)
            a[i++] = 0x1605a141;
            a[i++] = 0x7557bb2f;
        } else {
            a[i++] = bytes4(uint32(type(uint16).max) << 16); // uint16 cleaning mask
            // shl(0xe1) synthesis operands (asm-verified)
            a[i++] = 0x196d0c61;
            a[i++] = 0x505a53a5;
        }
    }

    function templateInitSignature() internal pure returns (string memory) {
        return "initialize((string,string,uint256,address,uint16,uint16,uint16,uint16,uint16,address,address,address,address))";
    }

    // ---------------------------------------------------- allowlist equality

    function test_factory_selectorSurface_exactAllowlist() public {
        _assertExactSurface(address(factory), factoryFunctions(), factoryErrors(), true);
    }

    function test_template_selectorSurface_exactAllowlist() public {
        _assertExactSurface(address(template), templateFunctions(), templateErrors(), false);
    }

    /// The clone's 45-byte runtime contains NO selectors of its own — the
    /// dispatcher scan is empty; everything forwards to the template (P-1/P-4).
    function test_clone_hasNoSelectorsOfItsOwn() public view {
        bytes4[] memory scanned = _scanPush4(token);
        assertEq(scanned.length, 0);
    }

    // ------------------------------------------------ forbidden (structural)

    function test_factory_forbiddenSelectors_absent() public view {
        _assertAbsent(address(factory), forbiddenSignatures());
    }

    function test_template_forbiddenSelectors_absent() public view {
        _assertAbsent(address(template), forbiddenSignatures());
    }

    // ---------------------------------------------------- forbidden (behavior)

    /// No fallback/receive anywhere: every forbidden selector call reverts, and
    /// plain ETH sends revert (no receive()).
    function test_factory_forbiddenCalls_revert() public {
        _assertCallsRevert(address(factory), forbiddenSignatures());
        (bool ok,) = address(factory).call{value: 1}("");
        assertTrue(!ok, "factory accepted plain ETH send (receive?)");
    }

    function test_template_forbiddenCalls_revert() public {
        _assertCallsRevert(address(template), forbiddenSignatures());
        (bool ok,) = address(template).call{value: 1}("");
        assertTrue(!ok, "template accepted plain ETH send (receive?)");
    }

    function test_clone_unknownSelector_reverts() public {
        (bool ok,) = token.call(abi.encodePacked(bytes4(keccak256("owner()"))));
        assertTrue(!ok, "clone answered a forbidden selector");
        (bool ok2,) = token.call{value: 1}("");
        assertTrue(!ok2, "clone accepted plain ETH send");
    }

    // --------------------------------------------------------- G4 P-2 slots

    /// EIP-1967 implementation/admin/beacon slots are zero on template and
    /// clone (no proxy-storage machinery exists at all).
    function test_eip1967Slots_zero() public view {
        bytes32 implSlot = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
        bytes32 adminSlot = 0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103;
        bytes32 beaconSlot = 0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50;
        assertEq(vm.load(address(template), implSlot), bytes32(0));
        assertEq(vm.load(address(template), adminSlot), bytes32(0));
        assertEq(vm.load(address(template), beaconSlot), bytes32(0));
        assertEq(vm.load(token, implSlot), bytes32(0));
        assertEq(vm.load(token, adminSlot), bytes32(0));
        assertEq(vm.load(token, beaconSlot), bytes32(0));
    }

    // -------------------------------------------------------------- internals

    /// @dev Walks runtime bytecode as an opcode stream (skipping PUSH payloads)
    ///      and collects PUSH4 operands — the dispatcher's selector table plus
    ///      custom-error revert selectors.
    function _scanPush4(address target) internal view returns (bytes4[] memory found) {
        bytes memory code = target.code;
        bytes4[] memory tmp = new bytes4[](code.length);
        uint256 n = 0;
        uint256 i = 0;
        while (i < code.length) {
            uint8 op = uint8(code[i]);
            if (op == 0x63 && i + 4 < code.length) {
                tmp[n++] = bytes4(
                    uint32(uint8(code[i + 1])) << 24 | uint32(uint8(code[i + 2])) << 16
                        | uint32(uint8(code[i + 3])) << 8 | uint32(uint8(code[i + 4]))
                );
                i += 5;
            } else if (op >= 0x60 && op <= 0x7f) {
                i += uint256(op - 0x5f) + 1;
            } else {
                i += 1;
            }
        }
        found = new bytes4[](n);
        for (uint256 j = 0; j < n; j++) {
            found[j] = tmp[j];
        }
    }

    function _assertExactSurface(
        address target,
        string[] memory fns,
        string[] memory errs,
        bool isFactory
    ) internal {
        bytes4[] memory scanned = _scanPush4(target);
        bytes4[] memory artifacts = nonSelectorPush4s(isFactory);

        // every scanned PUSH4 must be allowlisted (function ∪ error ∪
        // classified compiler artifact). Anything else is NO-GO.
        for (uint256 i = 0; i < scanned.length; i++) {
            assertTrue(
                _inStrings(scanned[i], fns) || _inStrings(scanned[i], errs)
                    || _inBytes4(scanned[i], artifacts),
                "PUSH4 outside allowlist"
            );
        }
        // every allowlisted FUNCTION selector must be present in the dispatch
        // table (functions are always PUSH4-dispatched). Error selectors are
        // NOT required in the scan: the optimizer encodes some custom-error
        // reverts via PUSH32/shared revert routines without a standalone PUSH4,
        // so a scan-completeness check on them would be encoding-fragile. Error
        // correctness is proven more strongly at the ABI level (forge inspect)
        // and behaviorally (unit tests vm.expectRevert each exact selector).
        for (uint256 i = 0; i < fns.length; i++) {
            assertTrue(_inScanned(bytes4(keccak256(bytes(fns[i]))), scanned), "missing fn selector");
        }
        // Automatic behavioral proof: EVERY scanned PUSH4 that is not an
        // allowlisted function selector must revert when called — artifacts
        // and error selectors included. A disguised extra function cannot hide
        // in the artifact classification because it would answer this call.
        for (uint256 i = 0; i < scanned.length; i++) {
            if (!_inStrings(scanned[i], fns)) {
                (bool ok,) = target.call(abi.encodePacked(scanned[i]));
                assertTrue(!ok, "non-function PUSH4 answered a call");
            }
        }
    }

    function _assertAbsent(address target, string[] memory forbidden) internal view {
        bytes4[] memory scanned = _scanPush4(target);
        for (uint256 i = 0; i < forbidden.length; i++) {
            assertTrue(
                !_inScanned(bytes4(keccak256(bytes(forbidden[i]))), scanned),
                "forbidden selector present"
            );
        }
    }

    function _inBytes4(bytes4 sel, bytes4[] memory set) internal pure returns (bool) {
        for (uint256 i = 0; i < set.length; i++) {
            if (set[i] == sel) return true;
        }
        return false;
    }

    function _assertCallsRevert(address target, string[] memory forbidden) internal {
        for (uint256 i = 0; i < forbidden.length; i++) {
            (bool ok,) = target.call(abi.encodePacked(bytes4(keccak256(bytes(forbidden[i])))));
            assertTrue(!ok, "forbidden selector answered");
        }
    }

    function _inStrings(bytes4 sel, string[] memory sigs) internal pure returns (bool) {
        for (uint256 i = 0; i < sigs.length; i++) {
            if (bytes4(keccak256(bytes(sigs[i]))) == sel) return true;
        }
        return false;
    }

    function _inScanned(bytes4 sel, bytes4[] memory scanned) internal pure returns (bool) {
        for (uint256 i = 0; i < scanned.length; i++) {
            if (scanned[i] == sel) return true;
        }
        return false;
    }
}
