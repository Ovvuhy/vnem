# VNEM Runtime Tool Registry

Generated from live MCP runtime registries. Do not edit this table manually.

- Total tools: 204
- Registry valid: true
- Missing behavior-test references: 18

| Server | Tool | Category | Side effect | Permissions | Evidence | Rollback | Implementation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| core | `vnem_bootstrap` | bootstrap | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_entrypoint` | entrypoint | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_usage_contract` | usage | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_mcp_visibility_doctor` | mcp | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_underuse_detector` | underuse | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_install_adoption_guide` | install | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_library_status` | library | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_search_skills` | skill | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_recommend_skills` | skill | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_search_apis` | api | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_recommend_apis` | api | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_review_skill_or_api` | api | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_api_safety_profile` | api | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_skill_safety_profile` | skill | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_get_required_capabilities` | get | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_activate_capability_pack` | activate | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_apply_skill_guidance` | skill | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_boost_task` | boost | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_route_task` | route | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_output_quality_plan` | output | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_anti_stagnation_check` | anti | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_plan_effort_budget` | plan | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_fast_answer_contract` | fast | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_design_ambition_plan` | design | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_visual_taste_audit` | visual | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_redesign_comparison_scorecard` | redesign | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_total_impact_design_plan` | total | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_design_direction_selector` | design | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_compact_output_contract` | compact | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_build_debugging_plan` | build | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_evidence_to_fix_check` | evidence | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_build_architecture_map` | build | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_code_change_contract` | code | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_build_ui_quality_plan` | build | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_visual_proof_contract` | visual | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_select_tools_for_task` | select | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_build_tools_plan` | build | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_build_browser_research_plan` | browser | read_only | approved_network_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_assess_research_need` | research | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_build_search_plan` | build | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_build_browsing_plan` | build | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_build_research_strategy` | research | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_build_source_ingestion_plan` | source | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_research_evidence_audit` | research | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_explain_tools_chain` | explain | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_prepare_tools_handoff` | prepare | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_build_api_integration_plan` | api | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_get_agent_profile` | get | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_compose_capability_contract` | compose | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_completion_audit` | completion | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_protection_review` | protection | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_proof_trail` | proof | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_status` | status | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_overview` | overview | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_route_intent` | route | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_get_source` | source | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_search` | search | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_recommend` | recommend | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_quality_gate` | quality | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_orchestrate` | orchestrate | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_get_entry` | get | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_compare` | compare | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_best_practices` | best | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_sources` | source | read_only | allowed_root_read | optional | not_required | scripts/vnem/core/server.mjs |
| core | `vnem_registry_status` | registry | read_only | allowed_root_read | optional | not_required | scripts/vnem/runtime/registry-tool.mjs |
| tools | `vnem_tools_status` | status | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_entrypoint` | entrypoint | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_capability_router` | capability | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_adoption_readiness` | adoption | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_visibility_doctor` | visibility | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_underuse_detector` | underuse | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_install_profile_emit` | install | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_install_doctor` | install | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_permission_profiles` | permission | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_permission_status` | permission | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_reliability_catalog` | reliability | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_action_recovery_plan` | action | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_high_power_action_review` | high | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_capability_gap_report` | capability | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_repo_deep_map` | repo | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_next_action_ranker` | next | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_no_placebo_progress_audit` | no | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_change_impact_plan` | change | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_test_selection_plan` | test | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_failure_triage` | failure | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_evidence_pack` | evidence | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_local_session_recovery` | local | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_repo_workflow_orchestrator` | repo | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_code_symbol_map` | code | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_mcp_surface_audit` | mcp | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_patch_target_finder` | patch | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_tool_test_coverage_map` | tool | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_source_impact_trace` | source | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_source_control_character_guard` | source | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_action_policy_preview` | action | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_trust_boundary_classify` | trust | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_manifest` | manifest | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_prepare_action_plan` | prepare | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_permission_prompt` | permission | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_read_file` | read | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_list_files` | list | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_search_files` | search | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_workspace_map` | workspace | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_read_many_files` | read | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_code_search` | code | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_find_references` | find | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_dependency_scan` | dependency | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_apply_patch` | apply | destructive_mutation | approved_local_mutation | required_redacted_record | required_or_explicitly_not_available | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_apply_patch_batch` | apply | destructive_mutation | approved_local_mutation | required_redacted_record | required_or_explicitly_not_available | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_restore_batch` | restore | destructive_mutation | approved_local_mutation | required_redacted_record | self | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_project_scan` | project | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_run_project_task` | project | destructive_mutation | approved_local_mutation | required_redacted_record | required_or_explicitly_not_available | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_start_dev_server` | start | destructive_mutation | approved_local_mutation | required_redacted_record | required_or_explicitly_not_available | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_stop_dev_server` | stop | destructive_mutation | approved_local_mutation | required_redacted_record | required_or_explicitly_not_available | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_list_dev_servers` | list | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_start_session` | start | destructive_mutation | approved_local_mutation | required_redacted_record | required_or_explicitly_not_available | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_finish_session` | finish | destructive_mutation | approved_local_mutation | required_redacted_record | required_or_explicitly_not_available | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_git_status` | git | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_git_diff_summary` | git | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_git_commit` | git | destructive_mutation | approved_local_mutation | required_redacted_record | required_or_explicitly_not_available | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_run_command` | run | destructive_mutation | approved_local_mutation | required_redacted_record | required_or_explicitly_not_available | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_api_request` | api | network_mutation | approved_network_mutation, scoped_credential_reference | required_redacted_record | required_or_explicitly_not_available | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_browser_capture` | browser | read_only | approved_network_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_browser_page_inspect` | browser | read_only | approved_network_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_browser_readability_extract` | browser | read_only | approved_network_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_browser_link_map` | browser | read_only | approved_network_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_browser_dom_search` | browser | read_only | approved_network_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_browser_accessibility_audit` | browser | read_only | approved_network_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_browser_compare_snapshots` | browser | read_only | approved_network_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_browser_research_pack` | browser | read_only | approved_network_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_search_provider_manifest` | search | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_search_query_builder` | search | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_web_search` | web | read_only | approved_network_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_search_result_ranker` | search | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_redirect_chain_check` | redirect | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_url_reputation_check` | url | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_captcha_detector` | captcha | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_download_safety_check` | download | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_claim_source_matrix` | source | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_research_gap_detector` | research | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_source_map` | source | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_source_extract` | source | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_source_graph` | source | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_architecture_review` | architecture | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_debug_evidence` | evidence | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_ui_surface_review` | ui | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_browser_evidence_plan` | browser | read_only | approved_network_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_browser_evidence_run` | browser | network_mutation | approved_network_mutation, scoped_credential_reference | required_redacted_record | required_or_explicitly_not_available | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_ui_evidence_audit` | evidence | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_fetch_url_text` | fetch | read_only | approved_network_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_source_quality_check` | source | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_research_brief` | research | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_collect_evidence` | evidence | destructive_mutation | approved_local_mutation | required_redacted_record | required_or_explicitly_not_available | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_github_status` | github | read_only | approved_network_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_github_settings_guide` | github | read_only | approved_network_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_github_profile_status` | github | read_only | approved_network_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_github_repo_inspect` | github | read_only | approved_network_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_repo_intelligence_report` | repo | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_github_branch_create` | github | destructive_mutation | approved_local_mutation | required_redacted_record | required_or_explicitly_not_available | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_github_commit_push` | github | network_mutation | approved_network_mutation, scoped_credential_reference | required_redacted_record | required_or_explicitly_not_available | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_github_pr_create` | github | network_mutation | approved_network_mutation, scoped_credential_reference | required_redacted_record | required_or_explicitly_not_available | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_github_pr_update` | github | network_mutation | approved_network_mutation, scoped_credential_reference | required_redacted_record | required_or_explicitly_not_available | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_github_issue_create` | github | network_mutation | approved_network_mutation, scoped_credential_reference | required_redacted_record | required_or_explicitly_not_available | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_github_issue_update` | github | network_mutation | approved_network_mutation, scoped_credential_reference | required_redacted_record | required_or_explicitly_not_available | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_github_issue_comment` | github | read_only | approved_network_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_github_labels_manage` | github | read_only | approved_network_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_github_actions_status` | github | read_only | approved_network_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_github_actions_rerun` | github | read_only | approved_network_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_github_ci_failure_triage` | github | read_only | approved_network_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_pr_quality_gate` | pr | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_task_progress_truth_check` | task | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_github_release_plan` | github | read_only | approved_network_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_github_release_create` | github | network_mutation | approved_network_mutation, scoped_credential_reference | required_redacted_record | required_or_explicitly_not_available | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_github_repo_settings_plan` | github | read_only | approved_network_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_github_repo_settings_apply` | github | network_mutation | approved_network_mutation, scoped_credential_reference | required_redacted_record | required_or_explicitly_not_available | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_cloudflare_status` | cloudflare | read_only | approved_network_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_cloudflare_auth_plan` | cloudflare | read_only | approved_network_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_cloudflare_accounts_list` | cloudflare | read_only | approved_network_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_cloudflare_projects_list` | cloudflare | read_only | approved_network_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_cloudflare_pages_deploy_plan` | cloudflare | read_only | approved_network_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_cloudflare_pages_deploy` | cloudflare | network_mutation | approved_network_mutation, scoped_credential_reference | required_redacted_record | required_or_explicitly_not_available | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_cloudflare_workers_deploy_plan` | cloudflare | read_only | approved_network_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_cloudflare_workers_deploy` | cloudflare | network_mutation | approved_network_mutation, scoped_credential_reference | required_redacted_record | required_or_explicitly_not_available | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_cloudflare_dns_plan` | cloudflare | read_only | approved_network_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_cloudflare_dns_apply` | cloudflare | network_mutation | approved_network_mutation, scoped_credential_reference | required_redacted_record | required_or_explicitly_not_available | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_cloudflare_env_plan` | cloudflare | read_only | approved_network_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_cloudflare_env_apply` | cloudflare | network_mutation | approved_network_mutation, scoped_credential_reference | required_redacted_record | required_or_explicitly_not_available | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_cloudflare_deploy_verify` | cloudflare | network_mutation | approved_network_mutation, scoped_credential_reference | required_redacted_record | required_or_explicitly_not_available | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_cloudflare_rollback_plan` | cloudflare | read_only | approved_network_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_cloudflare_rollback` | cloudflare | network_mutation | approved_network_mutation, scoped_credential_reference | required_redacted_record | self | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_cloudflare_cache_purge_plan` | cloudflare | read_only | approved_network_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_cloudflare_cache_purge` | cloudflare | network_mutation | approved_network_mutation, scoped_credential_reference | required_redacted_record | required_or_explicitly_not_available | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_evidence_pack_audit` | evidence | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_mutation_approval_contract` | mutation | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_secret_redaction_check` | secret | read_only | allowed_root_read | optional | not_required | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_restore_backup` | restore | destructive_mutation | approved_local_mutation | required_redacted_record | self | scripts/vnem/tools/server.mjs |
| tools | `vnem_tools_registry_status` | registry | read_only | allowed_root_read | optional | not_required | scripts/vnem/runtime/registry-tool.mjs |
| precision | `mcp_semantic_code_search` | mcp | read_only | allowed_root_read | optional | not_required | scripts/vnem-precision-mcp-server.mjs |
| precision | `mcp_apply_diff_patch` | mcp | destructive_mutation | approved_local_mutation | required_redacted_record | required_or_explicitly_not_available | scripts/vnem-precision-mcp-server.mjs |
| precision | `mcp_fetch_documentation` | mcp | read_only | allowed_root_read | optional | not_required | scripts/vnem-precision-mcp-server.mjs |
| precision | `mcp_execute_terminal_command` | mcp | destructive_mutation | approved_local_mutation | required_redacted_record | required_or_explicitly_not_available | scripts/vnem-precision-mcp-server.mjs |
| precision | `mcp_run_verification_tests` | mcp | destructive_mutation | approved_local_mutation | required_redacted_record | required_or_explicitly_not_available | scripts/vnem-precision-mcp-server.mjs |
| precision | `mcp_execute_ephemeral_script` | mcp | destructive_mutation | approved_local_mutation | required_redacted_record | required_or_explicitly_not_available | scripts/vnem-precision-mcp-server.mjs |
| precision | `mcp_registry_status` | mcp | read_only | allowed_root_read | optional | not_required | scripts/vnem/runtime/registry-tool.mjs |
