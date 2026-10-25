// Section d'entrée de l'école : carrousel de figurines plein écran.
// Le bouton « Se connecter » (barre du haut) appelle onDecouvrir pour ouvrir le panneau de connexion.
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';

// Les 4 figurines : image, couleur de fond et couleur du panneau
const IMAGES = [
  {
    src: 'https://fifth-gentle-45902158.figma.site/_components/v2/4de492f6d9cf8244ad5293233e5c6f52407d42fc/1.02464a56.png',
    bg: '#F4845F',
    panel: '#F79B7F',
  },
  {
    src: 'https://fifth-gentle-45902158.figma.site/_components/v2/4de492f6d9cf8244ad5293233e5c6f52407d42fc/2.b977faab.png',
    bg: '#6BBF7A',
    panel: '#85CC92',
  },
  {
    src: 'https://fifth-gentle-45902158.figma.site/_components/v2/4de492f6d9cf8244ad5293233e5c6f52407d42fc/3.4df853b4.png',
    bg: '#E882B4',
    panel: '#ED9DC4',
  },
  {
    src: 'https://fifth-gentle-45902158.figma.site/_components/v2/4de492f6d9cf8244ad5293233e5c6f52407d42fc/4.4457fbce.png',
    bg: '#6EB5FF',
    panel: '#8DC4FF',
  },
];

const TOTAL = IMAGES.length;
const TRANSITION_MS = 650;
// Défilement automatique : une figurine suivante toutes les 4 secondes
const AUTOPLAY_MS = 4000;
const EASE = 'cubic-bezier(0.4,0,0.2,1)';
// Couleur du texte : noire, pour rester lisible sur les quatre couleurs de fond
const ENCRE = '#111111';

// Rôle d'une figurine, selon l'index de la figurine au premier plan
function getRole(index, active) {
  if (index === active) return 'center';
  if (index === (active + TOTAL - 1) % TOTAL) return 'left';
  if (index === (active + 1) % TOTAL) return 'right';
  return 'back';
}

// Position, taille, flou et transparence de chaque figurine selon son rôle
function getItemStyle(role, isMobile) {
  const transition = ['transform', 'filter', 'opacity', 'left', 'bottom', 'height']
    .map((propriete) => `${propriete} ${TRANSITION_MS}ms ${EASE}`)
    .join(', ');

  const base = {
    position: 'absolute',
    aspectRatio: '0.6 / 1',
    transition,
    willChange: 'transform, filter, opacity',
  };

  if (role === 'center') {
    return {
      ...base,
      left: '50%',
      bottom: isMobile ? '22%' : '0',
      height: isMobile ? '60%' : '92%',
      transform: `translateX(-50%) scale(${isMobile ? 1.25 : 1.68})`,
      filter: 'none',
      opacity: 1,
      zIndex: 20,
    };
  }

  if (role === 'back') {
    return {
      ...base,
      left: '50%',
      bottom: isMobile ? '32%' : '12%',
      height: isMobile ? '13%' : '22%',
      transform: 'translateX(-50%) scale(1)',
      filter: 'blur(4px)',
      opacity: 1,
      zIndex: 5,
    };
  }

  // Figurines à gauche et à droite
  const gauche = role === 'left';
  return {
    ...base,
    left: gauche ? (isMobile ? '20%' : '30%') : isMobile ? '80%' : '70%',
    bottom: isMobile ? '32%' : '12%',
    height: isMobile ? '16%' : '28%',
    transform: 'translateX(-50%) scale(1)',
    filter: 'blur(2px)',
    opacity: 0.85,
    zIndex: 10,
  };
}

const deuxChiffres = (n) => String(n).padStart(2, '0');

export default function Hero({ onDecouvrir }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);

  // Verrou : pendant une animation, les clics suivants sont ignorés.
  // Une « ref » est utilisée pour que le verrou soit immédiat, même après plusieurs clics rapides.
  const isAnimatingRef = useRef(false);
  const timerRef = useRef(null);

  // Met à jour isMobile quand la fenêtre change de taille
  useEffect(() => {
    const surRedimensionnement = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', surRedimensionnement);
    return () => window.removeEventListener('resize', surRedimensionnement);
  }, []);

  // Précharge les 4 images au démarrage, pour éviter les écrans vides
  useEffect(() => {
    IMAGES.forEach((image) => {
      const precharge = new Image();
      precharge.src = image.src;
    });
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  // Défilement automatique : les figurines bougent toutes seules, sans appui sur les flèches
  useEffect(() => {
    const intervalle = window.setInterval(() => navigate('next'), AUTOPLAY_MS);
    return () => window.clearInterval(intervalle);
  }, []);

  function navigate(direction) {
    if (isAnimatingRef.current) return;
    isAnimatingRef.current = true;

    setActiveIndex((precedent) =>
      direction === 'next' ? (precedent + 1) % TOTAL : (precedent + TOTAL - 1) % TOTAL
    );

    timerRef.current = window.setTimeout(() => {
      isAnimatingRef.current = false;
      timerRef.current = null;
    }, TRANSITION_MS);
  }

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{
        backgroundColor: IMAGES[activeIndex].bg,
        transition: `background-color ${TRANSITION_MS}ms ${EASE}`,
        fontFamily: "'Inter', sans-serif",
        color: ENCRE,
      }}
    >
      <div className="relative w-full" style={{ height: '100vh', overflow: 'hidden' }}>
        {/* 1. Barre du haut : nom de l'école et bouton de connexion */}
        <header
          className="absolute inset-x-0 top-0 flex items-center justify-between"
          style={{ zIndex: 60, padding: isMobile ? '16px' : '24px 40px' }}
        >
          <div className="flex items-center gap-3">
            <span
              className="grid place-items-center"
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: '#ffffff',
                color: ENCRE,
                fontFamily: "'Anton', sans-serif",
                fontSize: 18,
              }}
            >
              ÉP
            </span>
            <span
              style={{
                fontFamily: "'Anton', sans-serif",
                fontSize: isMobile ? 14 : 20,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
              }}
            >
              École primaire
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              if (onDecouvrir) onDecouvrir();
            }}
            className="flex items-center gap-2 whitespace-nowrap rounded-full bg-white px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider text-[#111111] transition-colors duration-200 hover:bg-[#fff3ec] sm:px-6 sm:py-3 sm:text-sm"
          >
            Se connecter
            <ArrowRight size={18} strokeWidth={2.25} />
          </button>
        </header>

        {/* 2. Carrousel des figurines */}
        <div className="absolute inset-0" style={{ zIndex: 3 }}>
          {IMAGES.map((image, index) => {
            const role = getRole(index, activeIndex);
            return (
              <div key={index} style={getItemStyle(role, isMobile)}>
                <img
                  src={image.src}
                  alt={`Figurine ${index + 1}`}
                  draggable={false}
                  className="figurine-flottante"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    objectPosition: 'bottom center',
                    animationDelay: `${-index * 1.1}s`,
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* 3. Texte de bienvenue et boutons, en bas à gauche */}
        <div
          className="absolute"
          style={{
            zIndex: 60,
            left: isMobile ? 16 : 40,
            bottom: isMobile ? 20 : 96,
            maxWidth: isMobile ? 'calc(100% - 32px)' : 260,
          }}
        >
          <h1
            style={{
              fontFamily: "'Anton', sans-serif",
              fontWeight: 400,
              fontSize: isMobile ? 40 : 'clamp(40px, 4.4vw, 64px)',
              lineHeight: 0.95,
              textTransform: 'uppercase',
              letterSpacing: '0.01em',
              margin: 0,
              color: ENCRE,
            }}
          >
            Bienvenue
          </h1>

          <div className="flex gap-3" style={{ marginTop: isMobile ? 14 : 22 }}>
            <button
              type="button"
              aria-label="Figurine précédente"
              onClick={() => navigate('prev')}
              className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-white bg-white/30 text-[#111111] transition-colors duration-150 hover:bg-white sm:h-14 sm:w-14"
            >
              <ArrowLeft size={24} strokeWidth={2.25} />
            </button>
            <button
              type="button"
              aria-label="Figurine suivante"
              onClick={() => navigate('next')}
              className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-white bg-white/30 text-[#111111] transition-colors duration-150 hover:bg-white sm:h-14 sm:w-14"
            >
              <ArrowRight size={24} strokeWidth={2.25} />
            </button>
          </div>
        </div>

        {/* 4. Compteur, en bas à droite (ordinateur seulement) */}
        {!isMobile && (
          <div
            className="absolute"
            style={{
              zIndex: 60,
              right: 40,
              bottom: 40,
              fontFamily: "'Anton', sans-serif",
              fontSize: 22,
              letterSpacing: '0.08em',
              color: ENCRE,
            }}
          >
            {deuxChiffres(activeIndex + 1)} / {deuxChiffres(TOTAL)}
          </div>
        )}
      </div>
    </div>
  );
}
