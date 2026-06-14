# Fuentes — índice de papers y artículos (por DOI/URL)

Índice de las fuentes citadas en el artículo (entradas BibTeX en `../references.bib`).

> **Los PDF no se redistribuyen aquí**: son obra de sus editoriales (ACM, Springer, IEEE, NDSS,
> etc.) y su redistribución infringiría derechos de autor. Se enlazan por **DOI/URL**; los de
> acceso abierto se pueden descargar desde el enlace; los de pago, a través de tu institución.
> Consultado: 2026-06-14.

## Revisado por pares — seguridad en e-learning / Moodle / SCORM

- **Khamparia, A.; Pandey, B. (2016).** *Threat driven modeling framework using petri nets for
  e-learning system.* SpringerPlus 5(1):446. DOI: [10.1186/s40064-016-2101-0](https://doi.org/10.1186/s40064-016-2101-0).
  Acceso abierto. *(Modelado de amenazas en e-learning; el contenido/recursos como vector.)*

- **Al-azaiza, R. R.; Barhoom, T. S. M. (2016).** *Enhance MOODLE Security Against XSS
  Vulnerabilities.* International Journal of Computing and Digital Systems 5(5):421–430.
  DOI: [10.12785/ijcds/050507](https://doi.org/10.12785/ijcds/050507). Acceso abierto.
  *(XSS en Moodle —ficheros, páginas, entregas— y filtro RT_XSS_Cln.)*

- **Joseph, A. J. J.; Mariappan, M. (2023).** *Approaches to Overcome Security Risks and Threats
  in Online Learning Applications.* En *Secure Data Management for Online Learning Applications*,
  CRC Press. DOI: [10.1201/9781003264538-3](https://doi.org/10.1201/9781003264538-3). De pago.

## Literatura técnica / investigación de seguridad (no revisada por pares)

- **Hutchison, P. (2009).** *Cheating in SCORM.* pipwerks.
  <https://pipwerks.com/2009/03/22/cheating-in-scorm/>
  *(Referencia canónica sobre la manipulación cliente del tracking SCORM vía `LMSSetValue`.)*

- **Sonar / SonarSource (2023).** *Playing Dominos with Moodle's Security.*
  <https://www.sonarsource.com/blog/playing-dominos-with-moodles-security-2/>
  *(Cadena de vulnerabilidades en Moodle.)*

## Seguridad web: origen, frames/postMessage, CSP, XSS, sandboxing de JS (revisado por pares)

- **Barth, A.; Jackson, C.; Mitchell, J. C. (2009).** *Securing frame communication in browsers.*
  Communications of the ACM 52(6):83–91. DOI: [10.1145/1516046.1516066](https://doi.org/10.1145/1516046.1516066).
- **Son, S.; Shmatikov, V. (2013).** *The Postman Always Rings Twice: Attacking and Defending
  postMessage in HTML5 Websites.* NDSS 2013.
  <https://www.ndss-symposium.org/ndss2013/ndss-2013-programme/postman-always-rings-twice-attacking-and-defending-postmessage-html5-websites/>
- **Stamm, S.; Sterne, B.; Markham, G. (2010).** *Reining in the web with content security policy.*
  WWW 2010, pp. 921–930. DOI: [10.1145/1772690.1772784](https://doi.org/10.1145/1772690.1772784).
- **Weichselbaum, L.; Spagnuolo, M.; Lekies, S.; Janc, A. (2016).** *CSP Is Dead, Long Live CSP!*
  ACM CCS 2016, pp. 1376–1387. DOI: [10.1145/2976749.2978363](https://doi.org/10.1145/2976749.2978363).
- **Weinberger, J.; Saxena, P.; Akhawe, D.; Finifter, M.; Shin, R.; Song, D. (2011).**
  *A Systematic Analysis of XSS Sanitization in Web Application Frameworks.* ESORICS 2011 (LNCS).
  DOI: [10.1007/978-3-642-23822-2_9](https://doi.org/10.1007/978-3-642-23822-2_9).
- **Agten, P.; Van Acker, S.; Brondsema, Y.; Phung, P. H.; Desmet, L.; Piessens, F. (2012).**
  *JSand: complete client-side sandboxing of third-party JavaScript without browser modifications.*
  ACSAC 2012, pp. 1–10. DOI: [10.1145/2420950.2420952](https://doi.org/10.1145/2420950.2420952).
- **Dawson, P. (2020).** *Defending Assessment Security in a Digital World.* Routledge.
  DOI: [10.4324/9780429324178](https://doi.org/10.4324/9780429324178).

## H5P / capacidades (online)

- **H5P.** *Security* (las librerías son código de confianza). <https://h5p.org/documentation/installation/security>
- **Moodle.** *Capability moodle/h5p:updatelibraries.* <https://docs.moodle.org/en/Capabilities/moodle/h5p:updatelibraries>
- **CVE-2026-30875** (Chamilo, RCE por import de `.h5p`). <https://github.com/chamilo/chamilo-lms/security/advisories/GHSA-mj4f-8fw2-hrfm>

## Trabajo relacionado: JS de terceros, CSP, XSS de cliente, sandboxing, LMS

Enlace directo al PDF (acceso abierto) cuando existe; si no, DOI.

- **Nikiforakis, N.; Invernizzi, L.; Kapravelos, A.; et al. (2012).** *You Are What You Include:
  Large-scale Evaluation of Remote JavaScript Inclusions.* ACM CCS 2012, 736–747.
  DOI: [10.1145/2382196.2382274](https://doi.org/10.1145/2382196.2382274) ·
  PDF: <https://www.kapravelos.com/publications/jsinclusions-CCS12.pdf>
  *(Confianza transitiva en JS de terceros; base del modelo de amenaza.)*
- **Lauinger, T.; Chaabane, A.; Arshad, S.; et al. (2017).** *Thou Shalt Not Depend on Me: Analysing
  the Use of Outdated JavaScript Libraries on the Web.* NDSS 2017.
  DOI: [10.14722/ndss.2017.23414](https://doi.org/10.14722/ndss.2017.23414) ·
  PDF: <https://www.ndss-symposium.org/wp-content/uploads/2017/09/ndss2017_02B-1_Lauinger_paper.pdf>
  *(Librerías JS desactualizadas con vulnerabilidades conocidas; cadena de suministro.)*
- **Roth, S.; Barron, T.; Calzavara, S.; Nikiforakis, N.; Stock, B. (2020).** *Complex Security Policy?
  A Longitudinal Analysis of Deployed Content Security Policies.* NDSS 2020.
  DOI: [10.14722/ndss.2020.23046](https://doi.org/10.14722/ndss.2020.23046) ·
  PDF: <https://www.ndss-symposium.org/wp-content/uploads/2020/02/23046.pdf>
  *(Desplegar CSP efectiva en producción es difícil → CSP como una capa, no única defensa.)*
- **Steffens, M.; Rossow, C.; Johns, M.; Stock, B. (2019).** *Don't Trust The Locals: Investigating the
  Prevalence of Persistent Client-Side XSS in the Wild.* NDSS 2019.
  DOI: [10.14722/ndss.2019.23009](https://doi.org/10.14722/ndss.2019.23009) ·
  PDF: <https://www.ndss-symposium.org/wp-content/uploads/2019/02/ndss2019_01B-1_Steffens_paper.pdf>
  *(XSS persistente de cliente; el tipo de carga latente que el origen opaco neutraliza.)*
- **Stock, B.; Lekies, S.; Mueller, T.; Spiegel, P.; Johns, M. (2014).** *Precise Client-side Protection
  against DOM-based Cross-Site Scripting.* USENIX Security 2014, 655–670.
  PDF: <https://www.usenix.org/system/files/conference/usenixsecurity14/sec14-paper-stock.pdf>
  *(Los filtros de cliente por cadenas se evaden ~73% → preferir aislamiento arquitectónico.)*
- **Heiderich, M.; Schwenk, J.; Frosch, T.; Magazinius, J.; Yang, E. Z. (2013).** *mXSS Attacks:
  Attacking Well-Secured Web-Applications by Using innerHTML Mutations.* ACM CCS 2013, 777–788.
  DOI: [10.1145/2508859.2516723](https://doi.org/10.1145/2508859.2516723) ·
  PDF: <https://cure53.de/fp170.pdf>
  *(Mutation XSS: markup que pasa el saneamiento y muta en script; H5P/`mod_page`.)*
- **Wang, P.; Guðmundsson, B. Á.; Kotowicz, K. (2021).** *Adopting Trusted Types in Production Web
  Frameworks to Prevent DOM-Based XSS: A Case Study.* IEEE EuroS&PW 2021, 60–73.
  DOI: [10.1109/EuroSPW54576.2021.00013](https://doi.org/10.1109/EuroSPW54576.2021.00013) ·
  PDF: <https://storage.googleapis.com/gweb-research2023-media/pubtools/6260.pdf>
  *(Defensa secure-by-default a escala; restringir la capacidad peligrosa en el límite.)*
- **Akacha, S. A.-L.; Awad, A. I. (2023).** *Enhancing Security and Sustainability of e-Learning Software
  Systems: A Comprehensive Vulnerability Analysis…* Sustainability 15(19):14132. Gold OA.
  DOI: [10.3390/su151914132](https://doi.org/10.3390/su151914132) ·
  <https://www.mdpi.com/2071-1050/15/19/14132>
  *(Análisis empírico de vulnerabilidades en LMS: Moodle, Chamilo, ILIAS.)*

## Notas

- Estándares y documentación web (MDN, WHATWG, ADL/SCORM, OWASP, Moodle dev docs) están en
  `../references.bib` como referencias online.
