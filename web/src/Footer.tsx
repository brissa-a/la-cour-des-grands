import { useState } from "react"

export function Footer() {
  const [legalOpen, setLegalOpen] = useState(false)
  return (
    <footer className="footer panel" data-obstacle="">
      <nav>
        <button className="link-button" onClick={() => setLegalOpen(!legalOpen)}>
          Mentions légales
        </button>
        <a href="https://github.com/brissa-a/la-cour-des-grands">GitHub</a>
        <a href="https://www.paypal.com/donate?hosted_button_id=63W6MWNC6JTU6">Faire un don</a>
      </nav>
      {legalOpen && (
        <div className="legal">
          <p>Ce site est hébergé par Scaleway SAS, 8 rue de la Ville l'Évêque, 75008 Paris, France.</p>
          <p>
            Données : open data de l'Assemblée nationale. Photos : Assemblée nationale, détourées avec RMBG-2.0 de BRIA AI.
          </p>
          <p>
            Recherche par adresse : géocodage par le service de l'IGN (Géoplateforme), circonscriptions d'après les contours et
            la liste électorale publiés par l'INSEE (2022).
          </p>
        </div>
      )}
    </footer>
  )
}
