--
-- PostgreSQL database dump
--

\restrict dLCnGWwOAUYMPub9ZrBrqnvLQDItwgfHwfvtIMTXbxqUkuzKLnc4dbXMiJFEIoi

-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: attempts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid,
    scenario_id uuid,
    started_at timestamp without time zone DEFAULT now(),
    completed_at timestamp without time zone,
    status character varying(20) DEFAULT 'active'::character varying,
    graded_at timestamp without time zone,
    CONSTRAINT attempts_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'completed'::character varying, 'abandoned'::character varying])::text[])))
);


ALTER TABLE public.attempts OWNER TO postgres;

--
-- Name: class_enrolments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.class_enrolments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    class_id uuid,
    student_id uuid,
    enrolled_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.class_enrolments OWNER TO postgres;

--
-- Name: classes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.classes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    teacher_id uuid,
    enrolment_code character varying(20) NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.classes OWNER TO postgres;

--
-- Name: injects; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.injects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    phase_id uuid,
    title character varying(255) NOT NULL,
    description text,
    file_path character varying(500),
    file_type character varying(50),
    min_delay_minutes integer DEFAULT 0,
    max_delay_minutes integer DEFAULT 5,
    created_at timestamp without time zone DEFAULT now(),
    release_type character varying(30) DEFAULT 'random_in_phase'::character varying NOT NULL,
    guaranteed_release_minutes integer,
    notify_student boolean DEFAULT true NOT NULL,
    file_name character varying(255),
    scenario_id uuid,
    CONSTRAINT injects_release_type_check CHECK (((release_type)::text = ANY ((ARRAY['random_in_phase'::character varying, 'guaranteed_in_phase'::character varying, 'random_in_scenario'::character varying, 'guaranteed_in_scenario'::character varying])::text[])))
);


ALTER TABLE public.injects OWNER TO postgres;

--
-- Name: objectives; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.objectives (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scenario_id uuid,
    description text NOT NULL,
    objective_type character varying(10) DEFAULT 'main'::character varying NOT NULL,
    order_index integer DEFAULT 0 NOT NULL,
    correct_answer text,
    max_attempts integer,
    max_score numeric(5,2) DEFAULT 10,
    CONSTRAINT objectives_objective_type_check CHECK (((objective_type)::text = ANY ((ARRAY['main'::character varying, 'side'::character varying])::text[])))
);


ALTER TABLE public.objectives OWNER TO postgres;

--
-- Name: phases; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.phases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scenario_id uuid,
    title character varying(255) NOT NULL,
    description text,
    order_index integer NOT NULL,
    unlock_time_minutes integer DEFAULT 0,
    duration_minutes integer DEFAULT 30 NOT NULL,
    requires_completion boolean DEFAULT false NOT NULL
);


ALTER TABLE public.phases OWNER TO postgres;

--
-- Name: questions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    phase_id uuid,
    question_text text NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    question_type character varying(25) DEFAULT 'phase_question'::character varying NOT NULL,
    blocks_progression boolean DEFAULT false NOT NULL,
    order_index integer DEFAULT 0 NOT NULL,
    scenario_id uuid,
    max_score numeric(5,2) DEFAULT 10 NOT NULL,
    CONSTRAINT questions_question_type_check CHECK (((question_type)::text = ANY ((ARRAY['phase_question'::character varying, 'end_of_scenario'::character varying])::text[])))
);


ALTER TABLE public.questions OWNER TO postgres;

--
-- Name: responses; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.responses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    attempt_id uuid NOT NULL,
    student_id uuid NOT NULL,
    question_id uuid,
    objective_id uuid,
    answer text,
    score numeric(5,2),
    is_correct boolean,
    is_locked boolean DEFAULT false NOT NULL,
    attempts_used integer DEFAULT 0 NOT NULL,
    submitted_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    grader_notes text,
    CONSTRAINT responses_source_check CHECK ((((question_id IS NOT NULL) AND (objective_id IS NULL)) OR ((question_id IS NULL) AND (objective_id IS NOT NULL))))
);


ALTER TABLE public.responses OWNER TO postgres;

--
-- Name: scenario_classes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.scenario_classes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scenario_id uuid NOT NULL,
    class_id uuid NOT NULL,
    assigned_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.scenario_classes OWNER TO postgres;

--
-- Name: scenarios; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.scenarios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    difficulty character varying(20),
    created_by uuid,
    created_at timestamp without time zone DEFAULT now(),
    is_published boolean DEFAULT false,
    estimated_time_minutes integer,
    CONSTRAINT scenarios_difficulty_check CHECK (((difficulty)::text = ANY ((ARRAY['easy'::character varying, 'medium'::character varying, 'hard'::character varying])::text[])))
);


ALTER TABLE public.scenarios OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    role character varying(20) NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT users_role_check CHECK (((role)::text = ANY ((ARRAY['student'::character varying, 'teacher'::character varying, 'admin'::character varying])::text[])))
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: vm_instances; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.vm_instances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    attempt_id uuid,
    container_id character varying(64) NOT NULL,
    host_port integer NOT NULL,
    status character varying(20) DEFAULT 'running'::character varying,
    started_at timestamp without time zone DEFAULT now(),
    stopped_at timestamp without time zone
);


ALTER TABLE public.vm_instances OWNER TO postgres;

--
-- Data for Name: attempts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.attempts (id, student_id, scenario_id, started_at, completed_at, status, graded_at) FROM stdin;
0341aa50-2c99-4445-afdb-fbe6cc82a3b4	630b878c-c962-4d48-aec8-5b688cc5d774	d5e14d1b-5baa-486c-94ca-939e9707030b	2026-03-17 12:57:19.703329	\N	active	\N
24ccc431-19e8-49c4-9cc2-8df718dacc65	630b878c-c962-4d48-aec8-5b688cc5d774	d5e14d1b-5baa-486c-94ca-939e9707030b	2026-03-17 12:57:19.707166	\N	active	\N
9c92019b-bebb-47c1-9250-9408766643ad	630b878c-c962-4d48-aec8-5b688cc5d774	e32ae873-425a-4ef2-ae90-e7b8c0a8ac96	2026-03-17 13:23:41.212684	2026-03-17 13:29:44.336914	completed	\N
533f38a8-bcab-4fbe-a301-837bd400631c	630b878c-c962-4d48-aec8-5b688cc5d774	e32ae873-425a-4ef2-ae90-e7b8c0a8ac96	2026-03-17 15:28:13.883977	2026-03-17 15:31:37.873436	completed	\N
9b73a0d0-249f-453e-891d-f8c2d9bb334e	630b878c-c962-4d48-aec8-5b688cc5d774	e32ae873-425a-4ef2-ae90-e7b8c0a8ac96	2026-03-17 15:50:53.215528	2026-03-18 10:38:42.378719	completed	\N
ff2c7c76-f28f-46b0-bf7f-3816d9b7d951	630b878c-c962-4d48-aec8-5b688cc5d774	e32ae873-425a-4ef2-ae90-e7b8c0a8ac96	2026-03-18 10:53:20.512028	2026-03-18 11:10:35.248265	completed	\N
b0edd2f0-411c-4b81-8cce-80393031e8ba	630b878c-c962-4d48-aec8-5b688cc5d774	e32ae873-425a-4ef2-ae90-e7b8c0a8ac96	2026-03-18 11:10:38.029138	2026-03-18 14:24:56.432791	completed	\N
405fb198-9a61-45c3-a14c-783ae6d99f63	630b878c-c962-4d48-aec8-5b688cc5d774	e32ae873-425a-4ef2-ae90-e7b8c0a8ac96	2026-03-18 14:32:23.322255	2026-03-18 14:50:07.309716	completed	\N
749b0b04-70a3-4449-a173-148d7caf1aeb	630b878c-c962-4d48-aec8-5b688cc5d774	e32ae873-425a-4ef2-ae90-e7b8c0a8ac96	2026-03-18 15:08:57.113569	2026-03-18 15:13:08.235572	completed	\N
2140957f-8bd5-4304-9741-6fd011596169	630b878c-c962-4d48-aec8-5b688cc5d774	94e6349d-2828-4697-8630-694198372688	2026-03-20 10:39:28.323167	2026-03-20 10:46:40.655539	completed	2026-03-20 15:05:36.154186
2ab832e6-86d3-4512-b415-fb91abd093f4	ebda0013-23be-4c7f-9e84-a077f0192035	94e6349d-2828-4697-8630-694198372688	2026-03-24 17:38:12.275049	2026-03-24 17:43:35.167629	completed	\N
998094cf-cddf-4e2f-a74f-5ca90dadd335	630b878c-c962-4d48-aec8-5b688cc5d774	94e6349d-2828-4697-8630-694198372688	2026-03-24 10:42:27.132798	2026-03-25 09:43:48.507842	completed	\N
606281d7-6a8f-4254-9905-62292d3f6f4d	630b878c-c962-4d48-aec8-5b688cc5d774	94e6349d-2828-4697-8630-694198372688	2026-03-24 10:42:27.135876	2026-03-25 10:29:31.70761	completed	\N
\.


--
-- Data for Name: class_enrolments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.class_enrolments (id, class_id, student_id, enrolled_at) FROM stdin;
6b783576-ffe3-432c-ac23-5a6d7ff6bf8c	3f2076e7-beb7-4ea5-8ff3-aea32c8811c4	630b878c-c962-4d48-aec8-5b688cc5d774	2026-03-12 16:42:08.595891
9ab5eca7-5a21-4753-b460-bebc74a5cbd2	c480d367-8f0f-47b9-b2e7-6eaf7f24253f	630b878c-c962-4d48-aec8-5b688cc5d774	2026-03-16 10:42:41.708369
\.


--
-- Data for Name: classes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.classes (id, name, teacher_id, enrolment_code, created_at) FROM stdin;
3f2076e7-beb7-4ea5-8ff3-aea32c8811c4	Test Class 1	ebda0013-23be-4c7f-9e84-a077f0192035	BQJBCG	2026-03-12 16:41:03.572005
c480d367-8f0f-47b9-b2e7-6eaf7f24253f	Test Class 2	ebda0013-23be-4c7f-9e84-a077f0192035	2T5EDH	2026-03-16 10:42:30.613773
\.


--
-- Data for Name: injects; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.injects (id, phase_id, title, description, file_path, file_type, min_delay_minutes, max_delay_minutes, created_at, release_type, guaranteed_release_minutes, notify_student, file_name, scenario_id) FROM stdin;
44721233-72b6-416c-98d6-f82490815f86	13b791c5-daad-40f6-9175-3d2986cc1da2	News Reports	A collection of news reports related to the case. 	uploads/scenarios/d5e14d1b-5baa-486c-94ca-939e9707030b/1773376342349_vde02ggk.jpg	\N	0	5	2026-03-13 15:32:33.232248	random_in_phase	\N	t	1773376342349_vde02ggk.jpg	d5e14d1b-5baa-486c-94ca-939e9707030b
d23df9d5-d630-45b0-9d94-8278909a0e14	c11717bf-3e00-4697-8905-441d91cc2b5d	Encrypted USB Drive	A heavily encrypted USB drive found in Kojima’s office containing multiple project files, internal emails, and draft game code. The files may contain evidence of unauthorized data transfers, NDA breaches, and project timelines inconsistent with official records. 	uploads/scenarios/e32ae873-425a-4ef2-ae90-e7b8c0a8ac96/1773790005899_e6zmh33m.jpg	\N	0	10	2026-03-18 14:32:12.031183	guaranteed_in_phase	1	t	\N	e32ae873-425a-4ef2-ae90-e7b8c0a8ac96
a3626309-464d-4a47-bb63-beae3d6a3cb9	f9f96ed4-4f8b-4fd2-a950-8a7b7cfa8f36	Digital Correspondence Audit	The archive contains emails referencing contractual disputes, potential copyright infringements, and private communications that may reveal undisclosed collaborations or personal gain. Forensic investigators must recover deleted emails, identify suspicious correspondence, and correlate metadata with other discovered evidence.	uploads/scenarios/e32ae873-425a-4ef2-ae90-e7b8c0a8ac96/1773790066419_rcjkry9j.jpg	\N	0	10	2026-03-18 14:32:12.031183	guaranteed_in_phase	1	t	\N	e32ae873-425a-4ef2-ae90-e7b8c0a8ac96
71833a4c-244d-4f9a-8ff6-655fa8a66191	\N	Phone Call	Kojima Call From Time of Incident	uploads/scenarios/e32ae873-425a-4ef2-ae90-e7b8c0a8ac96/1773802656629_dfoei42t.jpg	\N	0	3	2026-03-18 14:32:12.031183	random_in_phase	\N	t	\N	e32ae873-425a-4ef2-ae90-e7b8c0a8ac96
39371f37-253f-4061-9c50-6abc527977a1	\N	Voice Log Calls	Police have been provide with voice calls from the day of one of the key breaches. 	\N	\N	0	3	2026-03-18 10:29:37.056027	random_in_phase	\N	t	\N	\N
73fa938d-0f17-491c-8494-45abd9355cf4	\N	Voice Log Calls	Police have been provide with voice calls from the day of one of the key breaches. 	\N	\N	0	3	2026-03-18 10:40:23.32602	random_in_phase	\N	t	\N	\N
8dae4d6c-7ff1-40f4-b188-c3d9a60dd40f	\N	Voice Log Calls	Police have been provide with voice calls from the day of one of the key breaches. 	\N	\N	0	3	2026-03-18 10:53:08.429867	random_in_phase	\N	t	\N	\N
4baee5dd-c8a6-41f9-96c4-adfd5a1c79b3	\N	Voice Log Calls	Police have been provide with voice calls from the day of one of the key breaches. 	\N	\N	0	3	2026-03-18 10:53:08.429867	random_in_phase	\N	t	\N	\N
d4503939-6de2-4e8a-8b82-30df8b26d5b0	\N	Voice Log Calls	Police have been provide with voice calls from the day of one of the key breaches. 	\N	\N	0	3	2026-03-18 11:55:23.314709	random_in_phase	\N	t	\N	\N
7331c897-b638-44bb-af1c-673efc36431f	\N	Voice Log Calls	Police have been provide with voice calls from the day of one of the key breaches. 	\N	\N	0	3	2026-03-18 11:55:23.314709	random_in_phase	\N	t	\N	\N
3c89ce94-df98-4f9a-8364-8b49b8c44866	\N	Voice Log Calls	Police have been provide with voice calls from the day of one of the key breaches. 	\N	\N	0	3	2026-03-18 11:55:23.314709	random_in_phase	\N	t	\N	\N
a7fc301e-bf9c-4b76-ab31-3f34acbb0947	\N	Voice Log Calls	Police have been provide with voice calls from the day of one of the key breaches. 	\N	\N	0	3	2026-03-18 11:55:23.314709	random_in_phase	\N	t	\N	\N
5f980d55-ce21-4e81-be4c-389feb2c9ce8	\N	Voice Log Calls	Police have been provide with voice calls from the day of one of the key breaches. 	\N	\N	0	3	2026-03-18 11:55:30.299197	random_in_phase	\N	t	\N	\N
c2f5fba2-1206-44b9-87c0-e178cd31605b	\N	Voice Log Calls	Police have been provide with voice calls from the day of one of the key breaches. 	\N	\N	0	3	2026-03-18 11:55:30.299197	random_in_phase	\N	t	\N	\N
14fc274e-853b-44cb-a16a-41bc9bae1ff2	\N	Voice Log Calls	Police have been provide with voice calls from the day of one of the key breaches. 	\N	\N	0	3	2026-03-18 11:55:30.299197	random_in_phase	\N	t	\N	\N
db2491e1-7a8e-48a1-abe5-0e2b0f194873	\N	Voice Log Calls	Police have been provide with voice calls from the day of one of the key breaches. 	\N	\N	0	3	2026-03-18 11:55:30.299197	random_in_phase	\N	t	\N	\N
687bdc64-4c09-4602-80cc-d39c7cd23dda	\N	Voice Log Calls	Police have been provide with voice calls from the day of one of the key breaches. 	\N	\N	0	3	2026-03-18 11:55:30.299197	random_in_phase	\N	t	\N	\N
4210806f-48aa-44e7-9497-57bcece2f269	\N	Voice Log Calls	Police have been provide with voice calls from the day of one of the key breaches. 	\N	\N	0	3	2026-03-18 11:55:30.299197	random_in_phase	\N	t	\N	\N
43db7737-bd42-4cbe-b96d-71cdf6ec0fa1	\N	Voice Log Calls	Police have been provide with voice calls from the day of one of the key breaches. 	\N	\N	0	3	2026-03-18 11:55:30.299197	random_in_phase	\N	t	\N	\N
f1cec43a-8554-4ac9-919f-487b503ef5b7	\N	Voice Log Calls	Police have been provide with voice calls from the day of one of the key breaches. 	\N	\N	0	3	2026-03-18 11:55:30.299197	random_in_phase	\N	t	\N	\N
b615b244-14b0-46c5-bdd6-5b1d8f66d91f	\N	Voice Log Calls	Police have been provide with voice calls from the day of one of the key breaches. 	uploads/scenarios/e32ae873-425a-4ef2-ae90-e7b8c0a8ac96/1773802057215_3cc1s6s5.jpg	\N	0	3	2026-03-18 13:47:49.930792	random_in_phase	\N	t	\N	\N
79e7b766-ba65-458c-9a29-bb0285e1d9e6	55f94b77-c4a8-47ec-a969-149ca487a042	Damaged Smartphone Extraction	A heavily damaged smartphone belonging to the primary suspect has been recovered. The device shows signs of intentional destruction and possible remote wipe attempts. Investigators must recover accessible data, including cached messages, contacts, and application artifacts from encrypted messaging platforms.	uploads/scenarios/94e6349d-2828-4697-8630-694198372688/1773963135529_nbcffauv.css	\N	0	10	2026-03-20 10:39:16.166196	guaranteed_in_phase	1	t	\N	94e6349d-2828-4697-8630-694198372688
7cad862c-0368-439d-8c9e-265299788394	bfe30ff3-63b9-433b-90d8-e3b5b65b575c	Rogue Router Log Analysis	A portable router configured to create a closed network was seized at the scene. Logs indicate multiple connected devices and outbound traffic routed through anonymization services. Investigators must analyze connection logs, identify devices on the network, and trace suspicious external IP connections.	uploads/scenarios/94e6349d-2828-4697-8630-694198372688/1773963191015_6omwi0gj.jpg	\N	0	1	2026-03-20 10:39:16.166196	random_in_phase	\N	t	\N	94e6349d-2828-4697-8630-694198372688
\.


--
-- Data for Name: objectives; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.objectives (id, scenario_id, description, objective_type, order_index, correct_answer, max_attempts, max_score) FROM stdin;
9ea6bf59-c141-4f6d-b437-0c8492149276	94e6349d-2828-4697-8630-694198372688	Reconstruct the attackers’ communication network and determine if there are any ongoing or future threats linked to this incident.	main	0	\N	\N	0.00
facd3eba-ce6a-4f9f-bc64-e96eb9ed5c71	94e6349d-2828-4697-8630-694198372688	Identify the encrypted messaging application used by the attackers.	side	1	Signal	3	4.00
d1a2dd2f-8dcc-441c-8334-17af71f65fdb	94e6349d-2828-4697-8630-694198372688	Determine the external IP address contacted most frequently by the router.	side	2	185.193.126.45	\N	5.00
\.


--
-- Data for Name: phases; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.phases (id, scenario_id, title, description, order_index, unlock_time_minutes, duration_minutes, requires_completion) FROM stdin;
13b791c5-daad-40f6-9175-3d2986cc1da2	d5e14d1b-5baa-486c-94ca-939e9707030b	News Report	Police are getting you up to date on the incident.	0	0	30	f
c11717bf-3e00-4697-8905-441d91cc2b5d	e32ae873-425a-4ef2-ae90-e7b8c0a8ac96	Corporate Secrets Discovery	Kojima office has been raided following leaked private information. Investigators need to bypass encryption, analyze the file structure, and determine if any sensitive data has been exfiltrated.	0	0	3	t
f9f96ed4-4f8b-4fd2-a950-8a7b7cfa8f36	e32ae873-425a-4ef2-ae90-e7b8c0a8ac96	Digital Correspondence Audit	A backup of Kojima’s Konami email account from the last 5 years.	1	\N	3	f
55f94b77-c4a8-47ec-a969-149ca487a042	94e6349d-2828-4697-8630-694198372688	On-Site Device Triage	Initial forensic triage is conducted on devices recovered directly from the scene. Investigators must prioritize volatile and damaged devices to recover any immediate intelligence before data is lost.	0	0	3	f
bfe30ff3-63b9-433b-90d8-e3b5b65b575c	94e6349d-2828-4697-8630-694198372688	Network Infrastructure Analysis	Attention shifts to the local network infrastructure used during the incident. Investigators must analyze how the attackers communicated externally and whether any command-and-control systems or remote collaborators were involved.	1	\N	3	f
\.


--
-- Data for Name: questions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.questions (id, phase_id, question_text, created_at, question_type, blocks_progression, order_index, scenario_id, max_score) FROM stdin;
9869708b-f0f8-44b1-97f0-1d5aa221461f	55f94b77-c4a8-47ec-a969-149ca487a042	Who were the attackers communicating with before and during the hostage situation?	2026-03-20 10:39:16.166196	phase_question	t	0	94e6349d-2828-4697-8630-694198372688	5.00
3df9d80c-d985-4ab0-bb46-8a6169b372d8	\N	Does the evidence suggest any additional planned attacks or active collaborators?	2026-03-20 10:39:16.166196	end_of_scenario	t	1	94e6349d-2828-4697-8630-694198372688	10.00
e2fab178-fdbe-4aa1-b633-af0f0e6ed8d5	\N	What is your hypothesis ?	2026-03-20 10:39:16.166196	end_of_scenario	t	2	94e6349d-2828-4697-8630-694198372688	10.00
bc3ca96f-35c8-456d-869e-c98a717fa906	c11717bf-3e00-4697-8905-441d91cc2b5d	Testing Question for Phase	2026-03-18 14:32:12.031183	phase_question	t	0	e32ae873-425a-4ef2-ae90-e7b8c0a8ac96	10.00
38b0bfd3-5213-45d2-ac80-7ab57494c632	f9f96ed4-4f8b-4fd2-a950-8a7b7cfa8f36	Testing If This Will Appear Too !	2026-03-18 14:32:12.031183	phase_question	t	1	e32ae873-425a-4ef2-ae90-e7b8c0a8ac96	10.00
94b85d91-170c-43bb-8fd4-786a9e3da630	\N	Hi Im Test Question	2026-03-18 14:32:12.031183	end_of_scenario	t	2	e32ae873-425a-4ef2-ae90-e7b8c0a8ac96	10.00
323e4878-ed0e-45b8-a9f4-23d7fc29c464	\N	Test 2	2026-03-18 14:32:12.031183	end_of_scenario	t	3	e32ae873-425a-4ef2-ae90-e7b8c0a8ac96	10.00
\.


--
-- Data for Name: responses; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.responses (id, attempt_id, student_id, question_id, objective_id, answer, score, is_correct, is_locked, attempts_used, submitted_at, updated_at, grader_notes) FROM stdin;
71184992-20bc-46df-aab5-dcf60ede89f0	2140957f-8bd5-4304-9741-6fd011596169	630b878c-c962-4d48-aec8-5b688cc5d774	9869708b-f0f8-44b1-97f0-1d5aa221461f	\N	Ben	3.00	\N	f	0	2026-03-20 10:42:38.422226	2026-03-20 15:05:36.035831	Great answer
9b9ada18-d29f-4bcd-9a16-a3aaccc8175a	2140957f-8bd5-4304-9741-6fd011596169	630b878c-c962-4d48-aec8-5b688cc5d774	3df9d80c-d985-4ab0-bb46-8a6169b372d8	\N	Myself	2.00	\N	f	0	2026-03-20 10:46:40.64235	2026-03-20 15:05:36.040934	\N
6ee808b3-470c-4797-8bc4-d4d874cf262f	2140957f-8bd5-4304-9741-6fd011596169	630b878c-c962-4d48-aec8-5b688cc5d774	e2fab178-fdbe-4aa1-b633-af0f0e6ed8d5	\N	Self Aware	3.00	\N	f	0	2026-03-20 10:46:40.642483	2026-03-20 15:05:36.043677	\N
ebc00506-e0d9-43a8-8e76-6ba37bbe6743	2140957f-8bd5-4304-9741-6fd011596169	630b878c-c962-4d48-aec8-5b688cc5d774	\N	d1a2dd2f-8dcc-441c-8334-17af71f65fdb	185.193.126.45	5.00	t	f	3	2026-03-20 10:42:30.255406	2026-03-20 15:05:36.048422	\N
fb968644-d45b-47d5-a782-e57702e0fc13	2140957f-8bd5-4304-9741-6fd011596169	630b878c-c962-4d48-aec8-5b688cc5d774	\N	facd3eba-ce6a-4f9f-bc64-e96eb9ed5c71	fix\n	0.00	f	t	3	2026-03-20 10:40:14.958284	2026-03-20 15:05:36.148112	\N
590425a2-0af6-460c-86d6-a7b1f78cd505	998094cf-cddf-4e2f-a74f-5ca90dadd335	630b878c-c962-4d48-aec8-5b688cc5d774	\N	facd3eba-ce6a-4f9f-bc64-e96eb9ed5c71	fsdfsfs	0.00	f	t	3	2026-03-24 17:36:28.020372	2026-03-24 17:36:31.112757	\N
3b4cdff4-c565-4275-a050-934645d11667	998094cf-cddf-4e2f-a74f-5ca90dadd335	630b878c-c962-4d48-aec8-5b688cc5d774	\N	d1a2dd2f-8dcc-441c-8334-17af71f65fdb	Hi This Wrong	0.00	f	f	1	2026-03-24 17:37:16.25565	2026-03-24 17:37:16.25565	\N
77b5c351-9d87-4a48-a05a-eaf000116f65	2ab832e6-86d3-4512-b415-fb91abd093f4	ebda0013-23be-4c7f-9e84-a077f0192035	9869708b-f0f8-44b1-97f0-1d5aa221461f	\N	ertfewsrfa	\N	\N	f	0	2026-03-24 17:43:27.420951	2026-03-24 17:43:27.420951	\N
61f1572f-8705-440a-81c1-19dc301ec812	2ab832e6-86d3-4512-b415-fb91abd093f4	ebda0013-23be-4c7f-9e84-a077f0192035	3df9d80c-d985-4ab0-bb46-8a6169b372d8	\N	dsadasd	\N	\N	f	0	2026-03-24 17:43:35.124792	2026-03-24 17:43:35.124792	\N
c264f2f6-c4cd-4e0c-ad02-b24290ea47da	2ab832e6-86d3-4512-b415-fb91abd093f4	ebda0013-23be-4c7f-9e84-a077f0192035	e2fab178-fdbe-4aa1-b633-af0f0e6ed8d5	\N	asdadas	\N	\N	f	0	2026-03-24 17:43:35.159298	2026-03-24 17:43:35.159298	\N
4d6b686b-d704-44ca-9828-31afd293cd03	998094cf-cddf-4e2f-a74f-5ca90dadd335	630b878c-c962-4d48-aec8-5b688cc5d774	9869708b-f0f8-44b1-97f0-1d5aa221461f	\N	hi	\N	\N	f	0	2026-03-24 10:45:30.954077	2026-03-25 09:38:04.086641	\N
edf25572-b009-4aff-8906-37054d2ed959	998094cf-cddf-4e2f-a74f-5ca90dadd335	630b878c-c962-4d48-aec8-5b688cc5d774	e2fab178-fdbe-4aa1-b633-af0f0e6ed8d5	\N	Hi	\N	\N	f	0	2026-03-25 09:43:48.495978	2026-03-25 09:43:48.495978	\N
a5c985a2-2b62-4da9-b8a2-9902c945e77c	998094cf-cddf-4e2f-a74f-5ca90dadd335	630b878c-c962-4d48-aec8-5b688cc5d774	3df9d80c-d985-4ab0-bb46-8a6169b372d8	\N	Hi	\N	\N	f	0	2026-03-25 09:43:48.494687	2026-03-25 09:43:48.494687	\N
916bbe34-0dc8-48cc-89a3-831e42e0b0c7	606281d7-6a8f-4254-9905-62292d3f6f4d	630b878c-c962-4d48-aec8-5b688cc5d774	\N	facd3eba-ce6a-4f9f-bc64-e96eb9ed5c71	I CANT REMEMBER	0.00	f	t	3	2026-03-25 10:24:38.695122	2026-03-25 10:24:40.304664	\N
295be80c-8128-4b36-ab0e-e8a9eab9326b	606281d7-6a8f-4254-9905-62292d3f6f4d	630b878c-c962-4d48-aec8-5b688cc5d774	9869708b-f0f8-44b1-97f0-1d5aa221461f	\N	Josh L	\N	\N	f	0	2026-03-25 09:57:47.961259	2026-03-25 10:25:39.244442	\N
1982c746-d636-42a2-9154-57d5e1bb3524	606281d7-6a8f-4254-9905-62292d3f6f4d	630b878c-c962-4d48-aec8-5b688cc5d774	3df9d80c-d985-4ab0-bb46-8a6169b372d8	\N	Thankyou for working !	\N	\N	f	0	2026-03-25 10:29:31.694177	2026-03-25 10:29:31.694177	\N
2903b8c2-1b63-497e-bd47-4c565bb239e9	606281d7-6a8f-4254-9905-62292d3f6f4d	630b878c-c962-4d48-aec8-5b688cc5d774	e2fab178-fdbe-4aa1-b633-af0f0e6ed8d5	\N	Lets Go !	\N	\N	f	0	2026-03-25 10:29:31.69433	2026-03-25 10:29:31.69433	\N
63a611ac-6b19-4e83-80a1-e2ce7ddf1656	606281d7-6a8f-4254-9905-62292d3f6f4d	630b878c-c962-4d48-aec8-5b688cc5d774	\N	d1a2dd2f-8dcc-441c-8334-17af71f65fdb	1.12.24.34	0.00	f	f	2	2026-03-25 10:24:46.002634	2026-03-25 10:29:31.70228	\N
\.


--
-- Data for Name: scenario_classes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.scenario_classes (id, scenario_id, class_id, assigned_at) FROM stdin;
b8664f1a-f5c5-4736-8970-52511b8088fa	d5e14d1b-5baa-486c-94ca-939e9707030b	3f2076e7-beb7-4ea5-8ff3-aea32c8811c4	2026-03-13 15:32:33.232248
1215a545-a2d5-464e-b26f-459c40d04a28	e32ae873-425a-4ef2-ae90-e7b8c0a8ac96	c480d367-8f0f-47b9-b2e7-6eaf7f24253f	2026-03-18 14:32:12.031183
ee72d199-473b-4825-86bb-89f7e0028cca	94e6349d-2828-4697-8630-694198372688	3f2076e7-beb7-4ea5-8ff3-aea32c8811c4	2026-03-20 10:39:16.166196
\.


--
-- Data for Name: scenarios; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.scenarios (id, title, description, difficulty, created_by, created_at, is_published, estimated_time_minutes) FROM stdin;
d5e14d1b-5baa-486c-94ca-939e9707030b	Test 1	Drug Bust	medium	ebda0013-23be-4c7f-9e84-a077f0192035	2026-03-13 15:32:33.232248	t	20
e32ae873-425a-4ef2-ae90-e7b8c0a8ac96	Operation Phantom Legacy	Konami’s headquarters has been raided following allegations of uncovering sensitive information about Hideo Kojima’s past activities, including controversial contracts, intellectual property disputes, and possible unauthorized software practices. As a digital forensic investigator, you’ve been called in to examine the seized systems to determine what evidence exists, who may be involved, and the extent of potential corporate espionage or misconduct.	medium	ebda0013-23be-4c7f-9e84-a077f0192035	2026-03-17 13:23:28.092555	t	60
94e6349d-2828-4697-8630-694198372688	Operation Silent Breach	Following a successful counter-terrorism hostage rescue operation, a fortified apartment complex has been secured. Although the hostage was safely extracted, evidence suggests the attackers were part of a larger coordinated network using encrypted communications and anonymized infrastructure.	hard	ebda0013-23be-4c7f-9e84-a077f0192035	2026-03-20 10:36:14.130579	t	20
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, first_name, last_name, email, password_hash, role, created_at) FROM stdin;
cf329b0e-6bf9-4850-9bcf-4d5e813119c6	Test	User	test@test.com	$2b$10$jMeIKcRb4FHTAf3WONGT6uKOrADiruKbe/jRwSxaOhengZx.5sfdS	student	2026-03-09 10:52:35.098283
630b878c-c962-4d48-aec8-5b688cc5d774	Joshua	Lillington-Moore	joshua.lillington.moore888@gmail.com	$2b$10$M9EHcdLovb6X9c2VpPhlb.cXG1dMCwRuT8KKLIHqaEqWzE50p18TW	student	2026-03-09 12:44:35.549323
14355730-6cd0-4b3e-9857-1444153464b5	Admin	User	admin@gmail.com	$2b$10$CkjgUxaUj72zkcK3aXvR2OvVpckXCoOcRt5a7MEJqLnMhBx0jhhXi	admin	2026-03-10 14:57:03.139634
ebda0013-23be-4c7f-9e84-a077f0192035	Teacher	User	teacher@gmail.com	$2b$10$0uG/DnT3yja7B4PqEegzaui3C28hjjRwzDNZ/2gLPESgf3evjgieq	teacher	2026-03-10 14:57:03.213353
\.


--
-- Data for Name: vm_instances; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.vm_instances (id, attempt_id, container_id, host_port, status, started_at, stopped_at) FROM stdin;
863774d7-77b2-4cb0-8fae-9076be125c49	606281d7-6a8f-4254-9905-62292d3f6f4d	d897e81ff13ed319e27754a235c6ac25b8aa0b36c037003eb406b93e1776f67a	57032	stopped	2026-03-25 10:19:02.583252	2026-03-25 10:19:04.106773
74269a6a-f703-4339-a5ea-134f7b6813a8	606281d7-6a8f-4254-9905-62292d3f6f4d	76768c5a211a41d409d533865052990168a7284e94765220075883511f4af001	57710	stopped	2026-03-25 10:22:16.101011	2026-03-25 10:29:34.647052
\.


--
-- Name: attempts attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attempts
    ADD CONSTRAINT attempts_pkey PRIMARY KEY (id);


--
-- Name: class_enrolments class_enrolments_class_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_enrolments
    ADD CONSTRAINT class_enrolments_class_id_student_id_key UNIQUE (class_id, student_id);


--
-- Name: class_enrolments class_enrolments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_enrolments
    ADD CONSTRAINT class_enrolments_pkey PRIMARY KEY (id);


--
-- Name: classes classes_enrolment_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_enrolment_code_key UNIQUE (enrolment_code);


--
-- Name: classes classes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_pkey PRIMARY KEY (id);


--
-- Name: injects injects_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.injects
    ADD CONSTRAINT injects_pkey PRIMARY KEY (id);


--
-- Name: objectives objectives_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.objectives
    ADD CONSTRAINT objectives_pkey PRIMARY KEY (id);


--
-- Name: phases phases_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.phases
    ADD CONSTRAINT phases_pkey PRIMARY KEY (id);


--
-- Name: questions questions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_pkey PRIMARY KEY (id);


--
-- Name: responses responses_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.responses
    ADD CONSTRAINT responses_pkey PRIMARY KEY (id);


--
-- Name: scenario_classes scenario_classes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scenario_classes
    ADD CONSTRAINT scenario_classes_pkey PRIMARY KEY (id);


--
-- Name: scenario_classes scenario_classes_scenario_id_class_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scenario_classes
    ADD CONSTRAINT scenario_classes_scenario_id_class_id_key UNIQUE (scenario_id, class_id);


--
-- Name: scenarios scenarios_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scenarios
    ADD CONSTRAINT scenarios_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: vm_instances vm_instances_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vm_instances
    ADD CONSTRAINT vm_instances_pkey PRIMARY KEY (id);


--
-- Name: idx_vm_instances_attempt_running; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_vm_instances_attempt_running ON public.vm_instances USING btree (attempt_id) WHERE ((status)::text = 'running'::text);


--
-- Name: attempts attempts_scenario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attempts
    ADD CONSTRAINT attempts_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES public.scenarios(id);


--
-- Name: attempts attempts_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attempts
    ADD CONSTRAINT attempts_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id);


--
-- Name: class_enrolments class_enrolments_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_enrolments
    ADD CONSTRAINT class_enrolments_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id);


--
-- Name: class_enrolments class_enrolments_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_enrolments
    ADD CONSTRAINT class_enrolments_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id);


--
-- Name: classes classes_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.users(id);


--
-- Name: injects injects_phase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.injects
    ADD CONSTRAINT injects_phase_id_fkey FOREIGN KEY (phase_id) REFERENCES public.phases(id) ON DELETE CASCADE;


--
-- Name: injects injects_scenario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.injects
    ADD CONSTRAINT injects_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES public.scenarios(id) ON DELETE CASCADE;


--
-- Name: objectives objectives_scenario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.objectives
    ADD CONSTRAINT objectives_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES public.scenarios(id) ON DELETE CASCADE;


--
-- Name: phases phases_scenario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.phases
    ADD CONSTRAINT phases_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES public.scenarios(id) ON DELETE CASCADE;


--
-- Name: questions questions_phase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_phase_id_fkey FOREIGN KEY (phase_id) REFERENCES public.phases(id) ON DELETE CASCADE;


--
-- Name: questions questions_scenario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES public.scenarios(id) ON DELETE CASCADE;


--
-- Name: responses responses_attempt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.responses
    ADD CONSTRAINT responses_attempt_id_fkey FOREIGN KEY (attempt_id) REFERENCES public.attempts(id) ON DELETE CASCADE;


--
-- Name: responses responses_objective_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.responses
    ADD CONSTRAINT responses_objective_id_fkey FOREIGN KEY (objective_id) REFERENCES public.objectives(id) ON DELETE SET NULL;


--
-- Name: responses responses_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.responses
    ADD CONSTRAINT responses_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE SET NULL;


--
-- Name: responses responses_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.responses
    ADD CONSTRAINT responses_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id);


--
-- Name: scenario_classes scenario_classes_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scenario_classes
    ADD CONSTRAINT scenario_classes_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: scenario_classes scenario_classes_scenario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scenario_classes
    ADD CONSTRAINT scenario_classes_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES public.scenarios(id) ON DELETE CASCADE;


--
-- Name: scenarios scenarios_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scenarios
    ADD CONSTRAINT scenarios_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: vm_instances vm_instances_attempt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vm_instances
    ADD CONSTRAINT vm_instances_attempt_id_fkey FOREIGN KEY (attempt_id) REFERENCES public.attempts(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict dLCnGWwOAUYMPub9ZrBrqnvLQDItwgfHwfvtIMTXbxqUkuzKLnc4dbXMiJFEIoi

