
import { readFileSync } from 'node:fs';

export function loadHumanIntelligence(path) {
    const data = JSON.parse(readFileSync(path, 'utf8'));

    if (data.version !== '0.1') {
        throw new Error('Unsupported manifest version');
    }

    if (!data.motion_data || !data.audit_data) {
        throw new Error('Missing intelligence data');
    }

    return {
        mode: 'research_only',
        productionEnabled: false,
        rendererControlVerified: false,
        motionData: data.motion_data,
        auditData: data.audit_data,
        interactionStatus: data.interaction_status
    };
}

export function getMotionInventory(data) {
    return Object.entries(data.motionData).map(
        ([name, record]) => ({
            name,
            arrays: Object.keys(record.arrays),
            sha256: record.sha256
        })
    );
}
