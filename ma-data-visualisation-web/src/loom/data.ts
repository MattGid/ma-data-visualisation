
export interface EventData {
    signed_up?: string;
    submitted?: string;
    status?: string;
    awarded?: string;
    rejection?: string;
    [key: string]: string | undefined;
}

export interface Applicant {
    name_hash: string;
    program: string;
    events: EventData;
}

export type ProgramType = "HLA" | "InLET" | "Digital Health & Tech" | "F3" | "Other";

export const MOCK_DATA: Applicant[] = [
    { name_hash: "A1", program: "HLA", events: { signed_up: "2025-01-01", submitted: "2025-01-19", status: "Accepted" } },
    { name_hash: "B2", program: "InLET", events: { signed_up: "2024-01-12", submitted: "2024-01-12", awarded: "True", status: "Inactive" } },
    { name_hash: "C3", program: "HLA", events: { signed_up: "2023-09-13", submitted: "2023-09-20", status: "Rejection Email Sent" } },
    // Generate more synthetic data below
    ...Array.from({ length: 50 }).map((_, i) => ({
        name_hash: `GEN_${i}`,
        program: ["HLA", "InLET", "Digital Health & Tech", "F3"][i % 4],
        events: {
            signed_up: "2024-01-01",
            submitted: Math.random() > 0.3 ? "2024-02-01" : undefined,
            status: Math.random() > 0.5 ? "Accepted" : "Withdrawn"
        }
    }))
];

export function parseDateToFloat(dateStr?: string): number {
    if (!dateStr) return -1.0;
    // Map date to a float timeline (e.g., Year.Fraction)
    const d = new Date(dateStr);
    const start = new Date("2020-01-01").getTime();
    // const end = new Date("2026-01-01").getTime();
    const current = d.getTime();
    // Normalize 0.0 to 1.0 (or just seconds/days offset)
    return (current - start) / (1000 * 60 * 60 * 24); // Days since 2020
}

export function getProgramId(p: string): number {
    switch (p) {
        case "HLA": return 0;
        case "InLET": return 1;
        case "Digital Health & Tech": return 2;
        case "F3": return 3;
        default: return 0;
    }
}
