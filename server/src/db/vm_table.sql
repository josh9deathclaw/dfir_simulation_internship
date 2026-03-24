CREATE TABLE vm_instances (
    id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    attempt_id   uuid REFERENCES attempts(id) ON DELETE CASCADE,
    container_id varchar(64) NOT NULL,
    host_port    integer NOT NULL,
    status       varchar(20) DEFAULT 'running',
    started_at   timestamp DEFAULT now(),
    stopped_at   timestamp
);