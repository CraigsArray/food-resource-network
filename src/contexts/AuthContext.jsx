import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession]       = useState(null)
  const [user, setUser]             = useState(null)
  const [profile, setProfile]       = useState(null)
  const [memberships, setMemberships] = useState([])  // [{ id, organization_id, role, organizations: {id,name,domain} }]
  const [isAppAdmin, setIsAppAdmin] = useState(false)
  const [loading, setLoading]       = useState(true)

  async function loadUserData(userId) {
    const [{ data: prof }, { data: mems }, { data: adminRow }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase
        .from('organization_members')
        .select('*, organizations(id, name, domain, is_verified)')
        .eq('user_id', userId),
      supabase.from('app_admins').select('user_id').eq('user_id', userId).maybeSingle(),
    ])
    setProfile(prof ?? null)
    setMemberships(mems ?? [])
    setIsAppAdmin(!!adminRow)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        loadUserData(session.user.id).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        setLoading(true)
        loadUserData(session.user.id).finally(() => setLoading(false))
      } else {
        setProfile(null)
        setMemberships([])
        setIsAppAdmin(false)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, user, profile, memberships, isAppAdmin, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
