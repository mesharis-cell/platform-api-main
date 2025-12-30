export function formatDateForEmail(date: Date): string {
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    })
}

export function formatTimeWindow(start: Date | null, end: Date | null): string {
    if (!start || !end) return ''
    return `${formatDateForEmail(start)} ${start.toLocaleTimeString()} - ${end.toLocaleTimeString()}`
}