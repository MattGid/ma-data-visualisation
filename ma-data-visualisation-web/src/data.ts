// IL1 Programme Data - Parsed from CSV
import applicantsCsv from './applicants.csv?raw';

export interface Applicant {
    id: string
    firstName: string
    lastName: string
    fullName: string
    email: string
    cohort: string
    status: string
    deanery: string
    signupDate: string
}

// Parse date string (DD/MM/YYYY HH:MM) to numeric value for Z-axis positioning
export const parseDateToTimeline = (dateStr: string): number => {
    if (!dateStr) return 0
    // Handle "DD/MM/YYYY HH:MM" or just "DD/MM/YYYY"
    const justDate = dateStr.split(' ')[0]
    const parts = justDate.split('/')
    if (parts.length < 3) return 0
    const day = parseInt(parts[0])
    const month = parseInt(parts[1])
    const year = parseInt(parts[2])
    // Normalize to 0-100 range based on 2020-2026
    const yearOffset = year - 2020
    return (yearOffset * 12 + month) * 2
}

// Get cohort index for X-axis grouping
export const getCohortIndex = (cohort: string): number => {
    const cohorts = [
        'March 2022', 'September 2022',
        'March 2023', 'September 2023',
        'March 2024', 'September 2024',
        'March 2025', 'September 2025'
    ]
    const idx = cohorts.findIndex(c => cohort?.includes(c.split(' ')[0]) && cohort?.includes(c.split(' ')[1]))
    return idx >= 0 ? idx : Math.floor(Math.random() * cohorts.length) // Fallback for empty cohort
}

// Status to color mapping
export const getStatusColor = (status: string): string => {
    if (!status) return '#666666'
    const s = status.toLowerCase()
    if (s.includes('active')) return '#55ff88'
    if (s.includes('completed')) return '#ffffff'
    if (s.includes('withdrawn') || s.includes('rejection')) return '#ff4444'
    if (s.includes('inactive')) return '#888888'
    if (s.includes('deferred')) return '#ffcc00'
    if (s.includes('offer')) return '#00d2d3'
    if (s.includes('interview')) return '#9b59b6'
    return '#4d96ff' // Default applied blue
}

// --- CSV PARSER ---
const parseCSV = (csvText: string): Applicant[] => {
    const lines = csvText.split('\n');
    const headers = lines[0].split(',').map(h => h.trim());

    // Map headers to indices
    const idxFirst = headers.indexOf('First Name');
    const idxLast = headers.indexOf('Last Name');
    const idxEmail = headers.indexOf('Email Address');
    const idxDate = headers.indexOf('Portal Sign-up Date'); // "01/01/2025 21:04"
    const idxStatus = headers.indexOf('Current Status');
    const idxCohort = headers.indexOf('Cohort');
    const idxDeanery = headers.indexOf('Deanery');

    const data: Applicant[] = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Robust CSV Split (handling quoted values with commas)
        const matches: string[] = [];
        let inQuote = false;
        let buffer = '';

        for (let c = 0; c < line.length; c++) {
            const char = line[c];
            if (char === '"') {
                inQuote = !inQuote;
            } else if (char === ',' && !inQuote) {
                matches.push(buffer);
                buffer = '';
            } else {
                buffer += char;
            }
        }
        matches.push(buffer); // Last column

        if (matches.length < 5) continue; // Skip malformed rows

        const firstName = matches[idxFirst]?.trim() || 'Unknown';
        const lastName = matches[idxLast]?.trim() || '';
        const email = matches[idxEmail]?.trim() || '';

        // Date Cleanup: "01/01/2025 21:04" -> "01/01/2025"
        let rawDate = matches[idxDate]?.trim() || '01/01/2024 00:00';
        // If it comes from excel as specific format, we handle it.
        // Assuming file matches the standard provided.
        const dateStr = rawDate.split(' ')[0]; // Take only date part

        const status = matches[idxStatus]?.trim() || 'Applied';
        const cohort = matches[idxCohort]?.trim() || '';
        const deanery = matches[idxDeanery]?.trim() || '';

        // Only include valid-ish entries
        if (firstName === 'Unknown' && !lastName) continue;

        data.push({
            id: (i).toString(),
            firstName,
            lastName,
            fullName: `${firstName} ${lastName}`,
            email,
            cohort,
            status,
            deanery,
            signupDate: dateStr
        });
    }
    return data;
};

export const APPLICANTS: Applicant[] = parseCSV(applicantsCsv);
// End of file
