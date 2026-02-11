
import api from '../lib/api';

export interface Tool {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    tool_link: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export const getTools = async (): Promise<Tool[]> => {
    const response = await api.get('/tools');
    return response.data;
};

export const trackToolUsage = async (toolId: string) => {
    try {
        await api.post(`/tools/${toolId}/track`);
    } catch (error) {
        console.error('Failed to track tool usage', error);
        // Fire and forget, don't throw to disrupt UI
    }
};
