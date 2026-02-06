import { APPLICANTS, Applicant } from './data';

export type StageName = 'Signed Up' | 'Applied' | 'Interviewing' | 'Offer' | 'Active Cohort' | 'Awarded' | 'Terminal';

export interface ApplicantNode {
    id: string; // Hashed ID
    originalData: Applicant;
    events: { date: Date, stage: StageName, color: string, stageIndex: number }[];
    isTerminal: boolean; // Rejection/Withdrawn
    maxStageIndex: number;
    // Stable offsets for jitter
    offsetX: number;
    offsetZ: number;
}

export const STAGES: { name: StageName, color: string, label: string }[] = [
    { name: 'Signed Up', color: '#e0e0e0', label: 'SIGNED UP' },
    { name: 'Applied', color: '#4d96ff', label: 'APPLIED' }, // Blue
    { name: 'Interviewing', color: '#9b59b6', label: 'INTERVIEW' }, // Purple
    { name: 'Offer', color: '#00d2d3', label: 'OFFER' }, // Cyan
    { name: 'Active Cohort', color: '#2ecc71', label: 'ACTIVE' }, // Green
    { name: 'Awarded', color: '#f1c40f', label: 'AWARDED' }, // Gold
];

export const TERMINAL_COLOR = '#ff4444';

// Simple hash function for "Anonymization"
const simpleHash = (s: string) => {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = Math.imul(31, h) + s.charCodeAt(i) | 0;
    return 'ID-' + Math.abs(h).toString(16);
};

// Seeded random for stable jitter
const seededRandom = (seed: number) => {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
};

// Generate synthetic events based on current status and signup date
const generateEvents = (applicant: Applicant, index: number): ApplicantNode['events'] => {
    // Parse signup date (dd/mm/yyyy)
    const parts = applicant.signupDate.split('/');
    if (parts.length < 3) return []; // Invalid date
    const signupDate = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));

    const events: ApplicantNode['events'] = [];
    // Stage 0: Signed Up
    events.push({ date: signupDate, stage: 'Signed Up', color: STAGES[0].color, stageIndex: 0 });

    // Mock timeline progression based on Status
    const status = (applicant.status || '').toLowerCase();

    // Helper to add days with some random variance (deterministic based on ID/Expected)
    const addDays = (d: Date, days: number) => {
        const newDate = new Date(d);
        // Add random variance 0-10 days
        const variance = Math.floor(seededRandom(index * days) * 10);
        newDate.setDate(newDate.getDate() + days + variance);
        return newDate;
    };

    let currentDate = signupDate;
    let maxStage = 0;

    // Determine how far they got
    if (status.includes('completed') || status.includes('awarded')) maxStage = 5;
    else if (status.includes('active')) maxStage = 4;
    else if (status.includes('acceptance') || status.includes('offer') || status.includes('deferred')) maxStage = 3;
    else if (status.includes('interview')) maxStage = 2;
    // For those who are just 'Applied' or 'Submitted' or just generic
    else if (status.includes('submitted') || status.includes('applied')) maxStage = 1;
    // Ensure Withdrawn/Inactive get at least Applied stage so they don't look like they just signed up and vanished
    else if (status.includes('withdrawn') || status.includes('inactive') || status.includes('rejection')) maxStage = 1;
    // Default to Applied if they are in the system (since they have a row in the sheet)
    else maxStage = 1;

    // Add events sequence
    if (maxStage >= 1) { // Applied
        currentDate = addDays(currentDate, 5); // Applied ~5 days after signup
        events.push({ date: currentDate, stage: 'Applied', color: STAGES[1].color, stageIndex: 1 });
    }
    if (maxStage >= 2) { // Interview
        currentDate = addDays(currentDate, 14);
        events.push({ date: currentDate, stage: 'Interviewing', color: STAGES[2].color, stageIndex: 2 });
    }
    if (maxStage >= 3) { // Offer
        currentDate = addDays(currentDate, 7);
        events.push({ date: currentDate, stage: 'Offer', color: STAGES[3].color, stageIndex: 3 });
    }
    if (maxStage >= 4) { // Active
        currentDate = addDays(currentDate, 30); // Cohort usually starts later
        events.push({ date: currentDate, stage: 'Active Cohort', color: STAGES[4].color, stageIndex: 4 });
    }
    if (maxStage >= 5) { // Awarded
        currentDate = addDays(currentDate, 180); // 6 months later
        events.push({ date: currentDate, stage: 'Awarded', color: STAGES[5].color, stageIndex: 5 });
    }

    // Handle Terminal States
    // If "Withdrawn", "Rejection", "Inactive", we add a terminal event shortly after their last valid event
    if (status.includes('withdrawn') || status.includes('rejection') || status.includes('inactive')) {
        currentDate = addDays(currentDate, 10);
        // Track which stage they failed at (use the last assigned stage index)
        // If they had no valid stages (maxStage=0), they failed at Signed Up (index 0)
        let failureStageIndex = 0;
        if (events.length > 0) {
            failureStageIndex = events[events.length - 1].stageIndex;
        }
        events.push({ date: currentDate, stage: 'Terminal', color: TERMINAL_COLOR, stageIndex: failureStageIndex });
    }

    return events;
};

export const PROCESSED_DATA: ApplicantNode[] = APPLICANTS.map((a, i) => ({
    id: simpleHash(a.firstName + a.lastName),
    originalData: a,
    events: generateEvents(a, i),
    maxStageIndex: 5, // Theoretical max
    isTerminal: a.status?.toLowerCase().includes('withdrawn') || a.status?.toLowerCase().includes('inactive') || a.status?.toLowerCase().includes('rejection'),
    // Spread them out in the "lane" (Z axis jitter primarily, Y stack)
    offsetX: (seededRandom(i) - 0.5) * 4, // Jitter within tile width
    offsetZ: (seededRandom(i + 100) - 0.5) * 4
}));

// Helper to get min/max dates for slider
export const getDateRange = () => {
    let minT = new Date('2020-01-01').getTime();
    let maxT = new Date('2026-12-31').getTime();

    // Auto adjust to data if needed, but keeping fixed as requested 2020-2026
    return { min: minT, max: maxT };
};
