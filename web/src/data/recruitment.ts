import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export type OpeningStatus = 'OPEN' | 'PAUSED' | 'CLOSED';
export type EmploymentType = 'Full-time' | 'Part-time' | 'Contract' | 'Internship';
export type CandidateStage = 'APPLIED' | 'SCREENING' | 'SHORTLISTED' | 'INTERVIEW' | 'SELECTED' | 'OFFER_SENT' | 'HIRED' | 'REJECTED';

export interface JobOpening {
    id: string;
    job_code: string;
    title: string;
    department: string;
    hiring_manager: string;
    positions: number;
    employment_type: EmploymentType;
    experience: string;
    location: string;
    description: string;
    status: OpeningStatus;
    created_date: string;
}

export interface Candidate {
    id: string;
    name: string;
    email: string;
    phone: string;
    opening_id: string;
    experience: string;
    source: string;
    stage: CandidateStage;
    interview_date: string;
    feedback: string;
}

export interface Interview {
    id: string;
    candidate_id: string;
    scheduled_at: string;
    status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
    notes: string;
}

export interface Offer {
    id: string;
    candidate_id: string;
    status: 'SENT' | 'ACCEPTED' | 'DECLINED' | 'WITHDRAWN';
    sent_at: string;
}

type OpeningDraft = Omit<JobOpening, 'id' | 'job_code' | 'created_date'>;
type CandidateDraft = Omit<Candidate, 'id' | 'interview_date'> & { interview_date?: string };
export type RecruitmentOptions = {
    includeInterviews?: boolean;
    includeOffers?: boolean;
};

const JOB_OPENING_SELECT = 'id, job_code, title, department, hiring_manager, positions, employment_type, experience, location, description, status, created_date';
const CANDIDATE_SELECT = 'id, name, email, phone, opening_id, experience, source, stage, interview_date, feedback';
const INTERVIEW_SELECT = 'id, candidate_id, scheduled_at, status, notes';
const OFFER_SELECT = 'id, candidate_id, status, sent_at';

function recruitmentError(error: { message: string } | null, fallback: string): string | null {
    return error ? `${fallback}: ${error.message}` : null;
}

export function useRecruitment(options: RecruitmentOptions = {}) {
    const [openings, setOpenings] = useState<JobOpening[]>([]);
    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [interviews, setInterviews] = useState<Interview[]>([]);
    const [offers, setOffers] = useState<Offer[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        const [openingsResult, candidatesResult] = await Promise.all([
            supabase.from('job_openings').select(JOB_OPENING_SELECT).order('created_date', { ascending: false }),
            supabase.from('candidates').select(CANDIDATE_SELECT).order('created_at', { ascending: false }),
        ]);
        const baseError = openingsResult.error ?? candidatesResult.error;
        if (baseError) {
            setError(baseError.message);
            setLoading(false);
            return;
        }

        let interviewRows: Interview[] = [];
        let offerRows: Offer[] = [];
        if (options.includeInterviews || options.includeOffers) {
            const [interviewsResult, offersResult] = await Promise.all([
                options.includeInterviews
                    ? supabase.from('interviews').select(INTERVIEW_SELECT).order('scheduled_at', { ascending: true })
                    : Promise.resolve({ data: [], error: null }),
                options.includeOffers
                    ? supabase.from('offers').select(OFFER_SELECT).order('sent_at', { ascending: false })
                    : Promise.resolve({ data: [], error: null }),
            ]);
            const detailsError = interviewsResult.error ?? offersResult.error;
            if (detailsError) {
                setError(detailsError.message);
                setLoading(false);
                return;
            }
            interviewRows = (interviewsResult.data ?? []) as Interview[];
            offerRows = (offersResult.data ?? []) as Offer[];
        }

        setError(null);
        setOpenings((openingsResult.data ?? []) as JobOpening[]);
        setCandidates((candidatesResult.data ?? []) as Candidate[]);
        setInterviews(interviewRows);
        setOffers(offerRows);
        setLoading(false);
    }, [options.includeInterviews, options.includeOffers]);

    useEffect(() => { void refresh(); }, [refresh]);

    const runAction = useCallback(async (action: () => Promise<{ error: { message: string } | null }>, fallback: string) => {
        setActionLoading(true);
        const result = await action();
        if (result.error) {
            const message = recruitmentError(result.error, fallback);
            setError(message);
            setActionLoading(false);
            return message;
        }
        await refresh();
        setError(null);
        setActionLoading(false);
        return null;
    }, [refresh]);

    const addOpening = useCallback((opening: OpeningDraft) => runAction(
        async () => await supabase.from('job_openings').insert({ ...opening, job_code: `JOB-${crypto.randomUUID().slice(0, 8).toUpperCase()}` }),
        'Could not create job opening',
    ), [runAction]);

    const updateOpening = useCallback((id: string, changes: OpeningDraft) => runAction(
        async () => await supabase.from('job_openings').update(changes).eq('id', id),
        'Could not update job opening',
    ), [runAction]);

    const toggleOpening = useCallback((id: string, status: OpeningStatus = 'CLOSED') => runAction(
        async () => await supabase.from('job_openings').update({ status }).eq('id', id),
        'Could not update position status',
    ), [runAction]);

    const addCandidate = useCallback((candidate: CandidateDraft) => runAction(
        async () => await supabase.from('candidates').insert({ ...candidate, interview_date: candidate.interview_date || null }),
        'Could not add candidate',
    ), [runAction]);

    const updateCandidate = useCallback(async (id: string, changes: Partial<Omit<Candidate, 'id'>>) => {
        const { interview_date, ...candidateChanges } = changes;
        setActionLoading(true);
        const candidateResult = await supabase.from('candidates').update({ ...candidateChanges, ...(interview_date === undefined ? {} : { interview_date: interview_date || null }) }).eq('id', id);
        if (candidateResult.error) {
            const message = recruitmentError(candidateResult.error, 'Could not update candidate');
            setError(message);
            setActionLoading(false);
            return message;
        }
        if (changes.stage === 'OFFER_SENT') {
            const offerResult = await supabase.from('offers').upsert({ candidate_id: id, status: 'SENT' }, { onConflict: 'candidate_id' });
            if (offerResult.error) {
                const message = recruitmentError(offerResult.error, 'Candidate updated but offer could not be recorded');
                setError(message);
                setActionLoading(false);
                return message;
            }
        }
        await refresh();
        setError(null);
        setActionLoading(false);
        return null;
    }, [refresh]);

    const scheduleInterview = useCallback(async (candidate: string | { id: string }, scheduledAt = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 16)) => {
        const candidateId = typeof candidate === 'string' ? candidate : candidate.id;
        setActionLoading(true);
        const interviewResult = await supabase.from('interviews').insert({ candidate_id: candidateId, scheduled_at: scheduledAt, status: 'SCHEDULED' });
        if (interviewResult.error) {
            const message = recruitmentError(interviewResult.error, 'Could not schedule interview');
            setError(message);
            setActionLoading(false);
            return message;
        }
        const candidateResult = await supabase.from('candidates').update({ stage: 'INTERVIEW', interview_date: scheduledAt }).eq('id', candidateId);
        if (candidateResult.error) {
            const message = recruitmentError(candidateResult.error, 'Interview scheduled but candidate stage could not be updated');
            setError(message);
            setActionLoading(false);
            return message;
        }
        await refresh();
        setError(null);
        setActionLoading(false);
        return null;
    }, [refresh]);

    return { openings, candidates, interviews, offers, addOpening, updateOpening, toggleOpening, addCandidate, updateCandidate, scheduleInterview, refresh, loading, actionLoading, error };
}
