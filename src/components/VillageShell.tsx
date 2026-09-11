import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Coins, LogOut, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

export default function VillageShell({ children }: { children: ReactNode }) {
  const {user,logout}=useAuth(); const navigate=useNavigate();
  async function signOut(){await logout();navigate("/")}
  return <div className="min-h-screen bg-[#f5f7f3] text-[#13241c]"><header className="border-b border-[#dfe8e1] bg-[#10241d] text-white"><div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-5 py-4 md:px-8"><Link to="/dashboard" className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-lg bg-[#b9985a] text-[#10241d]"><Coins size={18}/></span><span className="font-display text-xl">Village Central</span></Link><nav className="flex items-center gap-2"><span className="hidden text-sm text-[#c9d9ce] sm:inline">{user?.display_name||user?.username}</span>{user?.role === "admin" && <Button asChild size="sm" className="bg-[#b9985a] text-[#10241d] hover:bg-[#d1b674]"><Link to="/admin"><Shield size={15}/> Admin Console</Link></Button>}<Button variant="ghost" size="sm" onClick={signOut} className="text-[#d7e4da] hover:bg-[#1d3e31] hover:text-white"><LogOut size={15}/> Sign out</Button></nav></div></header>{children}</div>;
}
