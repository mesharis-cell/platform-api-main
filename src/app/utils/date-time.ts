export function formatDateForEmail(date: Date | null): string {
    if (!date) return 'N/A'

    const d = new Date(date);
    return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    })
}

export function formatTimeWindow(start: Date | null, end: Date | null): string {
    if (!start || !end) return ''
    const s = new Date(start);
    const e = new Date(end);
    return `${formatDateForEmail(s)} ${s.toLocaleTimeString()} - ${e.toLocaleTimeString()}`
}