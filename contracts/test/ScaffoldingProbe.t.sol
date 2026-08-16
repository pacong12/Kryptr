// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ScaffoldingProbe} from "../src/ScaffoldingProbe.sol";

/// @notice forge-std-FREE test (zero-dep scaffolding; forge-std arrives
/// with the factory phase when cheatcodes are needed).
contract ScaffoldingProbeTest {
    function testVersionMatchesConstant() external {
        ScaffoldingProbe probe = new ScaffoldingProbe();
        require(probe.version() == 1, "probe: unexpected version");
        require(probe.VERSION() == 1, "probe: unexpected VERSION constant");
    }
}
