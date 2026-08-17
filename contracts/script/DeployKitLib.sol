// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {KryptrLaunchTokenTemplate} from "../src/TokenTemplate.sol";
import {KryptrTokenFactory} from "../src/TokenFactory.sol";

/// @title DeployKitLib — offline creation-data computation for the wave-6 deploy
/// @notice PURE calldata math: no chain reads, no signing, no broadcast anywhere.
///         The wave-5 closing ruling (Main) freezes the constructor parameters:
///         totalFeeBps = 175, bondAmount = 0.01 ETH; bondSink is an OPERATOR
///         input (user placeholder address, delivered at wave 6) and is never
///         defaulted here — fail-closed.
library DeployKitLib {
    uint16 internal constant TOTAL_FEE_BPS = 175;
    uint256 internal constant BOND_AMOUNT = 0.01 ether;

    /// @dev tx1 payload: deploys the master template (plain CREATE).
    function templateDeployData() internal pure returns (bytes memory) {
        return type(KryptrLaunchTokenTemplate).creationCode;
    }

    /// @dev tx2 payload: deploys the factory referencing the LIVE template
    ///      address from tx1 (factory constructor requires template code).
    ///      Argument order mirrors KryptrTokenFactory.constructor exactly:
    ///      (template, totalFeeBps, bondAmount, bondSink).
    function factoryDeployData(address template_, address bondSink_)
        internal
        pure
        returns (bytes memory)
    {
        require(template_ != address(0), "kit: template address zero");
        require(bondSink_ != address(0), "kit: bondSink zero (fail-closed)");
        return bytes.concat(
            type(KryptrTokenFactory).creationCode,
            abi.encode(template_, TOTAL_FEE_BPS, BOND_AMOUNT, bondSink_)
        );
    }

    /// @dev Mirror of KryptrTokenFactory's constructor-argument layout — the
    ///      decode target for the round-trip proof (S2 §4 item 1). Field order
    ///      MUST stay in lockstep with the constructor; drift is caught by
    ///      assertFactoryArgs and the kit tests.
    struct FactoryArgs {
        address template;
        uint16 totalFeeBps;
        uint256 bondAmount;
        address bondSink;
    }

    /// @dev Round-trip decode (S2 §4 item 1, drift-proof by construction):
    ///      parses the constructor-args segment back FROM the factory creation
    ///      bytes themselves — the values rendered to the operator are
    ///      literally the bytes that will be sent, parsed back. Fail-closed:
    ///      truncated data or a code prefix different from THIS build's
    ///      creation code reverts before anything is emitted.
    function decodeFactoryArgs(bytes memory creationData)
        internal
        pure
        returns (FactoryArgs memory)
    {
        bytes memory code = type(KryptrTokenFactory).creationCode;
        // Static tuple (address,uint16,uint256,address) = exactly 4 words.
        // Exact-length check keeps abi.decode total: a short segment would
        // otherwise hit decode's bare revert(0,0) with no diagnostic.
        require(creationData.length >= code.length + 128, "kit: creation data truncated");
        require(creationData.length == code.length + 128, "kit: args segment length drift");
        require(_prefixEq(creationData, code), "kit: creation code prefix drift");
        bytes memory args = new bytes(creationData.length - code.length);
        for (uint256 i = 0; i < args.length; i++) {
            args[i] = creationData[code.length + i];
        }
        return abi.decode(args, (FactoryArgs));
    }

    /// @dev Fail-closed tripwire (S2 §4 item 2, Web3Intel criterion c.2): the
    ///      decoded args MUST equal the frozen constants + operator inputs —
    ///      display alone is not enough. Any drift reverts the kit before a
    ///      payload can leave the machine.
    function assertFactoryArgs(FactoryArgs memory decoded_, address template_, address bondSink_)
        internal
        pure
    {
        require(decoded_.template == template_, "kit: decoded template drift");
        require(decoded_.totalFeeBps == TOTAL_FEE_BPS, "kit: decoded totalFeeBps drift");
        require(decoded_.bondAmount == BOND_AMOUNT, "kit: decoded bondAmount drift");
        require(decoded_.bondSink == bondSink_, "kit: decoded bondSink drift");
    }

    /// @dev Element-range keccak compare for memory byte arrays (Solidity
    ///      slices are calldata-only). True iff data starts with prefix.
    function _prefixEq(bytes memory data, bytes memory prefix) private pure returns (bool) {
        if (data.length < prefix.length) return false;
        bytes32 hData;
        bytes32 hPrefix;
        uint256 len = prefix.length;
        assembly {
            hData := keccak256(add(data, 0x20), len)
            hPrefix := keccak256(add(prefix, 0x20), len)
        }
        return hData == hPrefix;
    }
}
