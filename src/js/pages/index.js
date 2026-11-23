import { supabase } from "../supabase.js";

const loginButton = document.getElementById("discord-login");

loginButton.addEventListener("click", async () => {
    const { error } = await supabase.auth.signInWithOAuth({
        provider: "discord",
        options: {
            redirectTo: window.location.origin + "/dashboard.html"
        }
    });

    if (error) {
        alert("Erro ao entrar com Discord: " + error.message);
    }
});