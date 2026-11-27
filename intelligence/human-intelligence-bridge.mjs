
import { readFileSync } from 'node:fs';

function load(name) {
    return JSON.parse(readFileSync(
        new URL(name, import.meta.url), 'utf8'
    ));
}

export function getHumanIntelligence() {
    const manifest = load(
        './human_intelligence_manifest.json'
    );

    const profiles = load('./motion_profiles.json');
    const reports = load('./motion_quality_reports.json');

    return {
        version: '0.2',
        mode: 'shadow_review',
        productionEnabled: false,
        rendererControlVerified: false,
        motionProfiles: profiles.profiles,
        motionReports: reports,
        auditData: manifest.audit_data,
        interactionStatus: manifest.interaction_status
    };
}

export function prepareSceneReview(scene) {
    if (!scene || typeof scene !== 'object') {
        throw new Error('Invalid scene');
    }

    const intelligence = getHumanIntelligence();

    return {
        scene,
        reviewOnly: true,
        renderAllowedByAdapter: false,
        referenceProfiles: intelligence.motionProfiles.length,
        reviewRequirements: [
            'anatomical_stability',
            'temporal_continuity',
            'natural_gestures',
            'physical_interaction',
            'identity_continuity',
            'camera_body_motion_separation'
        ],
        rendererControlVerified: false
    };
}
