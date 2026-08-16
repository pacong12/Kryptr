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
}
