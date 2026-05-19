INSERT OR REPLACE INTO control_system_state (state_key, lock_flag, status, state_json, updated_at)
VALUES ('GLOBAL', 0, 'IDLE', '{"bootstrap":"schema_phase_v0_1","verified_workers":"116/116"}', CURRENT_TIMESTAMP);

INSERT OR REPLACE INTO control_phase_state (phase_key, display_name, status, data_ok, phase_json, updated_at)
VALUES
('system', 'System', 'schema_ready', 1, '{"phase":"system"}', CURRENT_TIMESTAMP),
('static', 'Static Data', 'not_started', 0, '{"phase":"static"}', CURRENT_TIMESTAMP),
('base', 'Base Stats', 'not_started', 0, '{"phase":"base"}', CURRENT_TIMESTAMP),
('delta', 'Incremental Delta', 'not_started', 0, '{"phase":"delta"}', CURRENT_TIMESTAMP),
('daily', 'Everyday Data', 'not_started', 0, '{"phase":"daily"}', CURRENT_TIMESTAMP),
('market', 'Market Data', 'not_started', 0, '{"phase":"market"}', CURRENT_TIMESTAMP),
('phase2a', 'Phase 2A Context', 'not_started', 0, '{"phase":"phase2a"}', CURRENT_TIMESTAMP),
('phase2b', 'Phase 2B Context', 'not_started', 0, '{"phase":"phase2b"}', CURRENT_TIMESTAMP),
('phase3a', 'Phase 3A Context', 'not_started', 0, '{"phase":"phase3a"}', CURRENT_TIMESTAMP),
('phase3b', 'Phase 3B Context', 'not_started', 0, '{"phase":"phase3b"}', CURRENT_TIMESTAMP),
('phase3c', 'Phase 3C Context', 'not_started', 0, '{"phase":"phase3c"}', CURRENT_TIMESTAMP),
('score', 'Scoring', 'not_started', 0, '{"phase":"score"}', CURRENT_TIMESTAMP);

INSERT OR REPLACE INTO control_locks (lock_key, lock_flag, updated_at)
VALUES ('GLOBAL_ORCHESTRATOR', 0, CURRENT_TIMESTAMP);
