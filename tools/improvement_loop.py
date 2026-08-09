#!/usr/bin/env python3
from __future__ import annotations
import argparse
from pathlib import Path
import json
import re


def line_of(text: str, needle: str) -> int:
    for index, line in enumerate(text.splitlines(), 1):
        if needle in line:
            return index
    raise ValueError(f"evidence_not_found:{needle}")


def q(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--compiler", type=Path, required=True)
    parser.add_argument("--zlib", type=Path, required=True)
    parser.add_argument("--results", type=Path, default=Path("RESULTS.dicel"))
    args = parser.parse_args()

    lexer_path = args.compiler / "src/core/exec-lexer.ts"
    parser_path = args.compiler / "src/core/exec-stmt-parser.ts"
    emitter_path = args.compiler / "src/emitters/stmt-ts.ts"
    types_path = args.compiler / "src/emitter.ts"
    adler_path = args.zlib / "adler32.c"
    lexer = lexer_path.read_text()
    stmt_parser = parser_path.read_text()
    emitter = emitter_path.read_text()
    type_emitter = types_path.read_text()
    adler = adler_path.read_text()

    evidence = {
        "errcode": line_of(lexer, "ErrCode      = 28"),
        "lbracket": line_of(lexer, "LBracket     = 28"),
        "percent": line_of(lexer, "Percent = 7"),
        "parse_for": line_of(stmt_parser, "private parseFor"),
        "parse_expr": line_of(stmt_parser, "private parseExpr"),
        "binary_emit": line_of(emitter, 'case "binary"'),
        "num_map": line_of(type_emitter, "'num':  'number'"),
        "base": line_of(adler, "#define BASE 65521U"),
        "nmax": line_of(adler, "#define NMAX 5552"),
        "buffer": line_of(adler, "const Bytef *buf"),
        "combine_shift": line_of(adler, "adler1 >> 16"),
    }
    if lexer.count("private readErrCode") != 2:
        raise SystemExit("duplicate_readErrCode_precondition_changed")
    if "ExecTokenType.EqEq" not in stmt_parser or "ExecTokenType.NotEq" not in stmt_parser:
        raise SystemExit("binary_parser_precondition_changed")
    if re.search(r"^\s*(Plus|Star)\s*=", lexer, re.M):
        raise SystemExit("arithmetic_token_precondition_changed")

    suggestions = [
        {
            "id": "SUG-0001", "loop": 1, "area": "lexer",
            "evidence": f"exec-lexer.ts:{evidence['errcode']}+{evidence['lbracket']}",
            "problem": "ErrCode_and_LBracket_share_numeric_token_28",
            "change": "assign_unique_token_ids!add_enum_uniqueness_test!fail_compiler_boot_on_collision",
            "validation": "enumerate_TokenType_values!assert_unique!run_28_conformance_cases",
            "priority": "critical",
        },
        {
            "id": "SUG-0002", "loop": 1, "area": "lexer",
            "evidence": f"exec-lexer.ts:{evidence['percent']}+exec-stmt-parser.ts:{evidence['parse_for']}",
            "problem": "percent_token_is_unconditionally_dispatched_as_for_loop",
            "change": "introduce_Modulo_token_or_loop_lookahead_percent_identifier_in!preserve_for_syntax",
            "validation": "parse_percent_for_loop!parse_numeric_modulo!reject_ambiguous_percent_sequence",
            "priority": "critical",
        },
        {
            "id": "SUG-0003", "loop": 1, "area": "lexer",
            "evidence": "exec-lexer.ts:309+318",
            "problem": "readErrCode_method_defined_twice",
            "change": "remove_duplicate_method!enable_no_duplicate_class_members!add_error_code_lexer_vectors",
            "validation": "typescript_noEmit!lexer_error_code_snapshot!conformance_28",
            "priority": "high",
        },
        {
            "id": "SUG-0004", "loop": 2, "area": "parser",
            "evidence": f"exec-stmt-parser.ts:{evidence['parse_expr']}",
            "problem": "expression_parser_supports_only_equality_and_inequality_binary_ops",
            "change": "add_precedence_layers_unary_multiplicative_additive_shift_relational_equality",
            "validation": "golden_ast_for_plus_minus_star_slash_modulo_shift_and_parentheses",
            "priority": "critical",
        },
        {
            "id": "SUG-0005", "loop": 2, "area": "emitter",
            "evidence": f"stmt-ts.ts:{evidence['binary_emit']}",
            "problem": "binary_emitter_maps_every_non_equality_operator_to_not_equal",
            "change": "define_typed_operator_map!emit_each_supported_operator!reject_unknown_operator",
            "validation": "compile_operator_matrix!execute_node_vectors!compare_expected_values",
            "priority": "critical",
        },
        {
            "id": "SUG-0006", "loop": 2, "area": "exec_ir",
            "evidence": f"adler32.c:{evidence['buffer']}+{evidence['nmax']}",
            "problem": "adler32_requires_index_access_while_loops_and_state_updates_not_represented",
            "change": "add_index_expr!while_stmt!assignment_stmt_or_ssa_lowering!compound_assignment_lowering",
            "validation": "port_adler32Byte_then_adler32_z!compile!execute_reference_vectors",
            "priority": "high",
        },
        {
            "id": "SUG-0007", "loop": 3, "area": "types",
            "evidence": f"emitter.ts:{evidence['num_map']}+adler32.c:{evidence['base']}+{evidence['combine_shift']}",
            "problem": "num_to_javascript_number_lacks_u32_overflow_and_bitwise_contract",
            "change": "add_u8_u32_u64_primitives!define_wrap_semantics!emit_unsigned_coercions_per_target",
            "validation": "boundary_vectors_0_255_65521_2pow32minus1!c_vs_target_hash_equality",
            "priority": "high",
        },
        {
            "id": "SUG-0008", "loop": 3, "area": "diagnostics",
            "evidence": "evidence/adler32.compile.stderr.log:1",
            "problem": "unsupported_modulo_reports_generic_expected_token_error",
            "change": "emit_typed_UnsupportedOperator_diagnostic_with_operator_span_and_capability_hint",
            "validation": "adler_attempt_error_code_snapshot!no_generic_parse_error_for_known_operator",
            "priority": "medium",
        },
        {
            "id": "SUG-0009", "loop": 3, "area": "validation",
            "evidence": "RESULTS.dicel:CYCLE-0001+CYCLE-0002",
            "problem": "full_module_attempt_before_operator_capability_gate_wastes_cycles",
            "change": "add_capability_probe_matrix_before_port!order_modules_by_required_features!append_results_only_after_execution",
            "validation": "zlibVersion_pass!adler32Byte_gate!adler32_z_deferred_until_required_capabilities_pass",
            "priority": "medium",
        },
    ]

    results = args.results.read_text()
    pending = [s for s in suggestions if s["id"] not in results]
    if not pending:
        print(json.dumps({"loops": 3, "new_suggestions": 0, "status": "deduplicated"}))
        return 0

    block = ["", "~ImprovementSuggestion{", "  id:str,", "  loop:num,", "  area:str,", "  evidence:str,", "  problem:str,", "  proposed_change:str,", "  validation:str,", "  priority:str,", "  status:str", "}", ""]
    for s in pending:
        block.extend([
            "~ImprovementSuggestion{",
            f"  id:{q(s['id'])},",
            f"  loop:{s['loop']},",
            f"  area:{q(s['area'])},",
            f"  evidence:{q(s['evidence'])},",
            f"  problem:{q(s['problem'])},",
            f"  proposed_change:{q(s['change'])},",
            f"  validation:{q(s['validation'])},",
            f"  priority:{q(s['priority'])},",
            "  status:\"proposed_verified_evidence\"",
            "}",
            "",
        ])
    counts = {p: sum(1 for s in suggestions if s["priority"] == p) for p in ["critical", "high", "medium", "low"]}
    block.extend([
        "~SuggestionLoopSummary{",
        "  loops:num,",
        "  suggestions:num,",
        "  critical:num,",
        "  high:num,",
        "  medium:num,",
        "  low:num,",
        "  source_verified:bool,",
        "  next:str",
        "}",
        "",
        "~suggestion_loop:SuggestionLoopSummary{",
        "  loops:3,",
        f"  suggestions:{len(suggestions)},",
        f"  critical:{counts['critical']},",
        f"  high:{counts['high']},",
        f"  medium:{counts['medium']},",
        f"  low:{counts['low']},",
        "  source_verified:true,",
        "  next:\"implement_SUG_0001_to_SUG_0005_then_recompile_adler32Byte\"",
        "}",
    ])
    args.results.write_text(results.rstrip() + "\n" + "\n".join(block) + "\n")
    print(json.dumps({"loops": 3, "new_suggestions": len(pending), "ids": [s["id"] for s in pending], "evidence": evidence}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
