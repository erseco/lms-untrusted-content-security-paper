/*
 * Literal del avatar de las demos. GENERADO desde poc/pwned-avatar.svg —
 * no se edita a mano: se edita el .svg y se vuelve a generar. El test
 * test/avatar.test.js falla si este literal y el fichero dejan de coincidir
 * byte a byte.
 *
 * Va embebido en el bundle a proposito: asi ninguna demo descarga imagenes
 * de terceros y todas funcionan sin red y bajo origen opaco.
 */
export const AVATAR_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<!--
  pwned-avatar.svg — avatar propio (CC0) para las demostraciones POC-SAFE.
  Cabeza roja y ojos negros maliciosos. Sin marcas ni personajes externos.
  La sonda lo lleva embebido (probe/src/hosts/avatar.js): ninguna demo
  descarga imágenes de terceros.
-->
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 256 256"
     width="256"
     height="256"
     role="img"
     aria-labelledby="title desc">
  <title id="title">Avatar PWNED</title>
  <desc id="desc">Cabeza diabólica roja con cuernos y dos ojos negros inclinados.</desc>

  <!-- Cabeza y cuernos -->
  <path d="M27 92
           C17 71 17 45 25 22
           C29 10 43 8 49 20
           C55 34 66 45 82 56
           C96 50 111 47 128 47
           C145 47 160 50 174 56
           C190 45 201 34 207 20
           C213 8 227 10 231 22
           C239 45 239 71 229 92
           C240 110 246 131 246 153
           C246 210 193 249 128 249
           C63 249 10 210 10 153
           C10 131 16 110 27 92Z"
        fill="#f73b35"/>

  <!-- Ojos: anchos por fuera, afilados hacia el centro -->
  <path d="M61 99
           C70 88 80 86 89 95
           L119 124
           C126 131 123 140 115 146
           C98 158 77 155 66 143
           C54 130 51 112 61 99Z"
        fill="#17252c"/>
  <path d="M195 99
           C186 88 176 86 167 95
           L137 124
           C130 131 133 140 141 146
           C158 158 179 155 190 143
           C202 130 205 112 195 99Z"
        fill="#17252c"/>
</svg>
`;
