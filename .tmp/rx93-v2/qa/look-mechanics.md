# RX-93 look mechanics

RX-93 is a compact humanoid mecha falcon with a rigid helmeted head, luminous green eyes, gold V-fin, wing backpack, and a long rifle. The feet and lower torso remain registered and stable. The eyes lead, followed by a restrained rigid head yaw/pitch, then a small upper-torso follow-through; the rifle stays attached to the hands and lags slightly without changing sides or length. The V-fin and wing backpack remain rigid and preserve silhouette identity.

Motion budget: each 22.5-degree step uses an even, small change in eye aim, head yaw/pitch, shoulder visibility, and rifle foreshortening. No whole-sprite rotation, raster warp, scale change, baseline shift, or free-floating prop motion.

- 000 up: chin and faceplate pitch up; eyes aim up; more underside of V-fin/faceplate reads; rifle remains stable.
- 090 screen-right: head and upper torso yaw screen-right; the screen-right face side recedes and screen-left armor side becomes more visible; rifle becomes modestly foreshortened while remaining attached.
- 180 down: chin lowers toward chest; eyes aim down; upper helmet/V-fin surfaces become more visible; rifle remains stable.
- 270 screen-left: head and upper torso yaw screen-left; the screen-left face side recedes and screen-right armor side becomes more visible; rifle foreshortens oppositely while remaining attached.

Intermediate directions interpolate these four pose families continuously. The green eyes remain the same physical visor/eye construction; do not add pupils, eye whites, or replacement eyes.
