#!/usr/bin/env python3
from __future__ import annotations
import argparse
import json
from pathlib import Path
import re


def line_of(text: str, needle: str) -> int:
    for number, line in enumerate(text.splitlines(), 1):
        if needle in line:
            return number
    raise SystemExit(f"evidence_missing:{needle}")


def q(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--compiler", type=Path, required=True)
    ap.add_argument("--zlib", type=Path, required=True)
    ap.add_argument("--repo", type=Path, default=Path("."))
    ap.add_argument("--results", type=Path, default=Path("RESULTS.dicel"))
    args = ap.parse_args()
    compiler = args.compiler
    repo = args.repo
    results_path = args.results
    typechecker = (compiler / "src/typechecker.ts").read_text()
    emitter = (compiler / "src/emitter.ts").read_text()
    cli = (compiler / "src/cli.ts").read_text()
    adler = (args.zlib / "adler32.c").read_text()
    results = results_path.read_text()
    commands = (repo / "evidence/commands.log").read_text()

    evidence = {
        "type_validate": line_of(typechecker, "// Validate functions"),
        "body_parse": line_of(emitter, "const block = parseExecBlock(node.bodyRaw)"),
        "target_gate": line_of(cli, 'if (target !== "typescript")'),
        "body_error": line_of((repo / "evidence/adler32.compile.stderr.log").read_text(), "@:2:16"),
        "len_one": line_of(adler, "if (len == 1)"),
        "null_buf": line_of(adler, "if (buf == Z_NULL)"),
        "nmax_loop": line_of(adler, "while (len >= NMAX)"),
        "short_loop": line_of(adler, "while (len--)"),
    }
    if "parseExecBlock" in typechecker:
        raise SystemExit("body_parser_precondition_changed")
    conformance_inputs = sorted((compiler / "tests/conformance").glob("*/input.dicel"))
    executable_arithmetic = 0
    for path in conformance_inputs:
        for line in path.read_text(errors="ignore").splitlines():
            stripped = line.strip().lstrip("\ufeff")
            if stripped.startswith(("*", "@", "^", "#", "~", "|", "$")):
                continue
            if re.search(r"\d\s*[+*/%]\s*\d|\b[a-zA-Z_]\w*\s*[+*/%]\s*[a-zA-Z_0-9]", stripped):
                executable_arithmetic += 1
    if executable_arithmetic != 0:
        raise SystemExit(f"arithmetic_conformance_precondition_changed:{executable_arithmetic}")
    if (repo / ".github/workflows").exists():
        raise SystemExit("ci_precondition_changed")
    if re.search(r"^\s*(previous_hash|chain_hash)\s*:", results, re.M):
        raise SystemExit("result_chain_precondition_changed")
    if "/tmp/" not in commands:
        raise SystemExit("absolute_path_precondition_changed")

    suggestions = [
        ("SUG-0010",4,"typechecker",f"typechecker.ts:{evidence['type_validate']}+emitter.ts:{evidence['body_parse']}","typecheck_passes_before_exec_body_is_parsed","parse_and_typecheck_ExecBlock_inside_validateFunction!surface_body_errors_during_check","adler_attempt_dicel_check_must_fail_before_emitter!conformance_28","critical"),
        ("SUG-0011",4,"diagnostics",f"adler32.compile.stderr.log:{evidence['body_error']}","body_diagnostic_resets_location_to_body_line_2_and_omits_file","carry_function_body_source_offset_into_ExecLexer!attach_file_line_column_to_DicelError","assert_adler_error_points_to_ports/zlib/adler32_attempt.dicel_line_4_percent","high"),
        ("SUG-0012",4,"targets",f"cli.ts:{evidence['target_gate']}","canonical_compiler_rejects_every_target_except_typescript","add_C_emitter_or_stable_C_ABI_target_after_TypeScript_operator_parity","compile_zlibVersion_to_C!gcc!compare_original_output","high"),
        ("SUG-0013",4,"conformance","dicel-compiler/tests/conformance:28_cases","conformance_suite_has_zero_executable_arithmetic_body_cases","add_operator_precedence_valid_invalid_and_emitter_snapshots_to_conformance","conformance_arithmetic_matrix!legacy_28_remain_green","critical"),
        ("SUG-0014",5,"zlib_semantics",f"adler32.c:{evidence['len_one']}+{evidence['null_buf']}","adler_port_plan_omits_len_one_fast_path_and_null_buffer_contract","model_null_input_result_one!preserve_len_one_branch!add_exact_vectors","C_and_target_match_for_null_len0_len1","high"),
        ("SUG-0015",5,"zlib_semantics",f"adler32.c:{evidence['nmax_loop']}+{evidence['short_loop']}","adler_port_plan_omits_NMAX_chunking_and_remainder_paths","port_in_three_stages_byte_short_buffer_NMAX_blocks!preserve_mod_reduction_points","vectors_len_15_16_5551_5552_5553_11104","high"),
        ("SUG-0016",5,"testing","adler32.c:61-125","single_fixed_vector_cannot_prove_checksum_equivalence","add_seeded_differential_fuzzer_C_vs_generated_target_with_edge_lengths_and_random_bytes","10000_seeded_cases!zero_mismatch!store_seed_and_hashes","high"),
        ("SUG-0017",5,"safety","tests/zlib_version_original.c+adler32.c","native_reference_execution_lacks_sanitizer_gate","compile_reference_with_undefined_and_address_sanitizers_for_port_vectors","gcc_ubsan_asan_exit_zero!stderr_empty","medium"),
        ("SUG-0018",6,"reproducibility","evidence/commands.log:/tmp_paths","loop_requires_untracked_absolute_compiler_and_zlib_directories","add_bootstrap_script_with_pinned_repo_commits_tool_versions_and_cache_directory","fresh_clone_one_command_reproduces_RESULTS_cycle_hashes","high"),
        ("SUG-0019",6,"ci","repository:.github/workflows_absent","no_remote_gate_reexecutes_compiler_and_parity_tests","add_GitHub_Actions_matrix_for_conformance_compile_execute_compare_and_dedup","pull_request_blocks_on_any_stage_failure","high"),
        ("SUG-0020",6,"integrity","RESULTS.dicel:no_chain_hash","append_only_claim_has_no_cryptographic_chain","add_previous_hash_cycle_hash_evidence_hash_set_and_verify_command","tampered_prior_cycle_causes_chain_validation_failure","medium"),
        ("SUG-0021",6,"automation","DICEL_CLONE.dicel:manual_counts","project_state_counts_are_hand_maintained_and_can_drift","derive_ProjectState_and_SuggestionLoopSummary_from_RESULTS_AST","regenerate_state_idempotently!diff_zero_on_second_run","medium"),
    ]
    pending = [s for s in suggestions if s[0] not in results]
    if not pending:
        print(json.dumps({"loops": [4,5,6], "new_suggestions": 0, "status": "deduplicated"}))
        return 0
    lines = [""]
    for sid,loop,area,ev,problem,change,validation,priority in pending:
        lines.extend([
            "~ImprovementSuggestion{",
            f"  id:{q(sid)},", f"  loop:{loop},", f"  area:{q(area)},", f"  evidence:{q(ev)},",
            f"  problem:{q(problem)},", f"  proposed_change:{q(change)},", f"  validation:{q(validation)},",
            f"  priority:{q(priority)},", "  status:\"proposed_verified_evidence\"", "}", ""
        ])
    all_priorities = [s[7] for s in suggestions]
    lines.extend([
        "~suggestion_loop_v2:SuggestionLoopSummary{",
        "  loops:6,", "  suggestions:21,",
        "  critical:6,", "  high:10,", "  medium:5,", "  low:0,",
        "  source_verified:true,",
        "  next:\"implement_body_validation_arithmetic_parser_operator_emitter_and_conformance_before_adler_retry\"",
        "}",
    ])
    results_path.write_text(results.rstrip()+"\n"+"\n".join(lines)+"\n")
    print(json.dumps({"loops": [4,5,6], "new_suggestions": len(pending), "ids": [x[0] for x in pending], "evidence": evidence, "arithmetic_conformance_cases": executable_arithmetic, "ci_present": False, "hash_chain_present": False}, indent=2))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
