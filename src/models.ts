interface Location {
  time_slot: string;
  addresses: string[];
}

interface Region {
  name: string;
  locations: Location[];
}

export interface PowerOutage {
  name: string;
  date: string;
  regions: Region[];
}

// export interface Response {
//   outages: PowerOutage[];
// }

export interface User {
  id: number;
  chat_id: string;
  username?: string;
  created_at: string;
}

export interface Schedule {
  id: number;
  user_id: number;
  address: string;
  frequency: string;
  last_run_at?: string;
  created_at: string;
}
