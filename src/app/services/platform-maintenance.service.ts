type PlatformMaintenanceState = {
    maintenance_mode?: boolean | null;
    maintenance_message?: string | null;
    maintenance_until?: Date | string | null;
    maintenance_updated_at?: Date | string | null;
    maintenance_updated_by?: string | null;
};

const normalizeDate = (value: Date | string | null | undefined) => {
    if (!value) return null;
    const parsed = value instanceof Date ? value : new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isMaintenanceActive = (state: PlatformMaintenanceState) => {
    if (!state.maintenance_mode) return false;
    const until = normalizeDate(state.maintenance_until);
    if (!until) return true;
    return until.getTime() > Date.now();
};

const projectMaintenance = (state: PlatformMaintenanceState) => ({
    enabled: isMaintenanceActive(state),
    raw_enabled: Boolean(state.maintenance_mode),
    message: state.maintenance_message ?? null,
    until: normalizeDate(state.maintenance_until)?.toISOString() ?? null,
    updated_at: normalizeDate(state.maintenance_updated_at)?.toISOString() ?? null,
    updated_by: state.maintenance_updated_by ?? null,
});

export const PlatformMaintenanceService = {
    isMaintenanceActive,
    projectMaintenance,
};
