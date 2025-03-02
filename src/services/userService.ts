// userService.ts

import supabase from '../supabase';
import { User } from '../models';

// Create a new user
export async function createUser(chatId: string, username?: string): Promise<User> {
    console.log(chatId, username);
    const { data, error } = await supabase
        .from('users')
        .insert([{ chat_id: chatId, username }])
        .single();

    if (error) {
        console.error('Error creating user:', error);
        throw new Error(error.message);
    }

    return data;
}

// Get user by chat_id
export async function getUserByChatId(chatId: string): Promise<User | null> {
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('chat_id', chatId)
        .single();

    if (error) {
        console.error('Error fetching user:', error);
        return null;
    }

    return data;
}
