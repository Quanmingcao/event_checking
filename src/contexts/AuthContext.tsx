import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null; // Added profile
  signOut: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  signOut: async () => {},
  loading: true,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null); // Added profile state
  const [loading, setLoading] = useState(true);

  console.log('AuthProvider State:', { loading, user: user?.email, profile: profile?.role });

  useEffect(() => {
    // 1. Get initial session
    const initSession = async () => {
        try {
            console.log('initSession: Start');
            const { data: { session } } = await supabase.auth.getSession();
            console.log('initSession: Got session', session?.user?.email);
            setSession(session);
            setUser(session?.user ?? null);
            
            if (session?.user) {
                console.log('initSession: Fetching profile...');
                await fetchProfile(session.user.id);
                console.log('initSession: Fetched profile');
            }
        } catch (error) {
            console.error('Error init session:', error);
        } finally {
            console.log('initSession: Finishing (setLoading false)');
            setLoading(false);
        }
    };
    
    initSession();

    // 2. Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      console.log('AuthChange:', _event);
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
          await fetchProfile(session.user.id);
      } else {
          setProfile(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
      try {
          console.log('fetchProfile: Querying Supabase...');
          
          // Create a promise that rejects after 4 seconds
          const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Profile fetch timed out')), 4000)
          );

          // Race between the actual fetch and the timeout
          const { data, error } = await Promise.race([
              supabase.from('profiles').select('*').eq('id', userId).single(),
              timeoutPromise
          ]) as any; // Cast to avoid TS issues with race

          console.log('fetchProfile: Result', { data, error });
          if (!error && data) {
              setProfile(data as Profile);
          }
      } catch (error) {
          console.error('Error fetching profile (or timeout):', error);
          // Don't block the app! proceed without profile
      }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  if (loading) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      );
  }

  return (
    <AuthContext.Provider value={{ session, user, profile, signOut, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
