import { API_BASE_URL } from './config';

export interface Item {
    id: number;
    name: string;
}

export const fetchItems = async (): Promise<Item[]> => {
    const response = await fetch(`${API_BASE_URL}/items`);
    if (!response.ok) {
        throw new Error('Failed to fetch items');
    }
    return response.json();
};

export const createItem = async (name: string): Promise<Item> => {
    const response = await fetch(`${API_BASE_URL}/items`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name }),
    });
    if (!response.ok) {
        throw new Error('Failed to create item');
    }
    return response.json();
};
