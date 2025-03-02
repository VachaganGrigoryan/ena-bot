import supabase from "../supabase";
import { Schedule } from "../models";

// Create a new schedule for a user
export async function createSchedule(
  userId: number,
  address: string,
  frequency: string = "daily",
): Promise<Schedule> {
  const { data, error } = await supabase
    .from("schedules")
    .insert([{ user_id: userId, address, frequency }])
    .single();

  if (error) {
    console.error("Error creating schedule:", error);
    throw new Error(error.message);
  }

  return data;
}

// Get all schedules for a chat_id
export async function getSchedulesByChatId(chatId: string) {
  const { data: userdata } = await supabase
    .from("users")
    .select("id")
    .eq("chat_id", chatId)
    .single();

  const { data, error } = await supabase
    .from("schedules")
    .select("*")
    .eq("user_id", userdata?.id);

  if (error) {
    console.error("Error fetching schedules:", error);
    return [];
  }

  return data;
}
