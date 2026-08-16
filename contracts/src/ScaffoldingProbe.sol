// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Gate-exercise probe for the wave-5 contracts scaffolding.
///
/// NOT business logic. Exists so forge build/test/fmt and Slither run on
/// real source from the very first contracts PR — vacuous gates on empty
/// src prove nothing (wave-5 entry gate #2).
///
/// REMOVAL CONDITION (vault, wave-5 kickoff): when this probe is removed
/// in the factory phase, the real factory/template test suite must take
/// over its gate-exercise role in the SAME PR — never a gap where
/// slither/fmt run on empty src again.
contract ScaffoldingProbe {
    uint256 public constant VERSION = 1;

    function version() external pure returns (uint256) {
        return VERSION;
    }
}
