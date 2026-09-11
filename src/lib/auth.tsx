import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, post, type SessionUser } from "./api";

type AuthContextValue = { user: SessionUser | null; loading: boolean; error: string; refresh: () => Promise<void>; login: (username:string,password:string)=>Promise<SessionUser>; logout:()=>Promise<void> };
const AuthContext = createContext<AuthContextValue | null>(null);
export function AuthProvider({children}:{children:ReactNode}) {
  const [user,setUser]=useState<SessionUser|null>(null); const [loading,setLoading]=useState(true); const [error,setError]=useState("");
  async function refresh(){setLoading(true);setError("");try{const r=await api<{authenticated:boolean;user?:SessionUser}>("/auth/session");setUser(r.authenticated?r.user||null:null)}catch(e:any){setUser(null);setError(e.message||"Unable to check session")}finally{setLoading(false)}}
  useEffect(()=>{void refresh()},[]);
  async function login(username:string,password:string){const r=await post<{user:SessionUser}>("/auth/login",{username,password});setUser(r.user);return r.user}
  async function logout(){try{await post("/auth/logout")}finally{setUser(null)}}
  const value=useMemo(()=>({user,loading,error,refresh,login,logout}),[user,loading,error]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
export function useAuth(){const v=useContext(AuthContext);if(!v)throw new Error("useAuth must be used inside AuthProvider");return v}
