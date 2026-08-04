const toggle = document.getElementById("themeToggle");

if(localStorage.getItem("theme") === "dark"){
    toggle.checked = true;
}

toggle.addEventListener("change", () => {

    if (toggle.checked) {
        document.body.classList.add("dark-theme");
        localStorage.setItem("theme", "dark");
    } else {
        document.body.classList.remove("dark-theme");
        localStorage.setItem("theme", "light");
    }

});
