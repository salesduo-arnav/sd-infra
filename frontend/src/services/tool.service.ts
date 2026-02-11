
import api from '../lib/api';

export const trackToolUsage = async (toolId: string) => {
    try {
        await api.post(`/tools/${toolId}/track`);
    } catch (error) {
        console.error('Failed to track tool usage', error);
        // Fire and forget, don't throw to disrupt UI
    }
};
