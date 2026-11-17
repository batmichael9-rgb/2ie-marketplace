import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function CreateVendorPage() {
  const user = await getCurrentUser();
  
  // Si l'utilisateur a déjà une boutique, redirection vers l'espace vendeur
  if (user?.vendor) {
    redirect("/espace-vendeur");
  }
  
  // Si l'utilisateur est connecté mais n'est pas vendeur, déconnexion et redirection vers inscription vendeur
  if (user && !user.vendor) {
    redirect("/inscription?vendeur=1&suivant=/espace-vendeur");
  }
  
  // Si pas connecté du tout, redirection vers inscription vendeur
  redirect("/inscription?vendeur=1&suivant=/espace-vendeur");
}
