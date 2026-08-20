/**
 * Ícone do MeuGasto embutido no email (frontend/public/pwa-192x192.png).
 *
 * É anexado como imagem inline (Content-ID) em vez de link remoto: clientes de
 * email bloqueiam imagens externas por padrão e a pasta estática do frontend
 * pode não estar publicada, o que deixava o logo quebrado no cabeçalho.
 */
export const LOGO_CID = 'meugasto-logo';
export const LOGO_FILENAME = 'meugasto.png';
export const LOGO_CONTENT_TYPE = 'image/png';

export const LOGO_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAMAAAADACAMAAABlApw1AAAAJFBMVEVMaXEQFyYQFyYQFyYQFyYRGCej5jVJZyyTzzMrPilj' +
  'jC99sTHHU6/CAAAABXRSTlMAm2jZKmWvTQwAAAAJcEhZcwAAA+gAAAPoAbV7UmsAAAX/SURBVHja7Z3ZdhshDIY7zKKF93/f' +
  '2idJU9ssQggwPuiiN3VsfYNYBv2IP3+WLVu2bNmyZcuWLVu2TGyHc25rYLevPdr7vu1nU9u3dhRHa+d/IVowuE7efzO4qd03' +
  'R3DnCDNDOPZzkO0mfWE7B5qb+PHbNMJo/2sJ3PkG5ib3v4LgTfxXE7yN/0qC43wjO2YcfyrHorfy/0bwPvMvAQAz3/4latcN' +
  'jka+e7wezDO06QYNAoj4yfl/EGAfRK6b9wUMblwDEF85Q7BsAuMGyLsvQ3BjGgDwEponoyawbADyV4GBTRMYNgDhVWTeogmO' +
  '3tH/0BOofi7YBvqfIdj6RlA0/PFumo6wd42goP+3tQP9rizC0xvUxZBr539gwg1O0VQ1Dm2t4p9JOlHE+8HWrQuA1P0gAtZ0' +
  'Apvxv2h0fG0vjn2wVx/Gkvkp1Aig7sWuQQcAxZxN2l7s7AMINMOWHwngNf7L/sz1GEVB5/9Tz0HlOLoZ92BWr11hFAAkQpnY' +
  'f1twXoBsE/QA8PHBhHNPOPuBDgAU90EwumJmIOoAwNEoIMGC4SGIxgBg9BmDZNWJ6SZqDwDxR8yShT+kY6g9AMcdFAE8NMEI' +
  'AB//fRABcPID7QFSEYASAErOgs0BIOUfiF5+MdUJugJQbs0MuSDE/gCcWQoAZwGSz6A5gM+u6DEHQEMBMLsOzQKcqTbqCQBT' +
  'AlwGAPhBALwAFsBsfeCThlGLiQxmnInHLiU4/UorAUh+hTEA8X8ZI8FqVATQbTX6kx1i+euICODq8z4APvwzmNvdzAFAl1dK' +
  'iO5i+lwM5QDSX2AD8CyA8JEHyAoASu98mQC8JiBj229UDsDpB2AAENJvxEKA0x5SZmeVWgBASDoQ/UDSRc70AGyxNxrUb3Bs' +
  'GAzOxpD4P8rlRmoBgvoHLNzj/wpCziZ3yB7AS5RilE+XUkTz6rPJqToAL1NMskg1kI1PMgdgodKQCrP04fGBzbOULBZKsooA' +
  'JHqPCgAo0CVhkdIj+P1gDfA8fyVFnnQVE7BMHqIH8EI9TDjcoHB1FUVWA0ChfsMXqXJBLDpTA2Ch/uF1xRSXbL1qzvi0BuBq' +
  '/U8UIaCt5tMagBT6EwotOp4YCHyh/lgJwPXj+i+Ev5+fuR+k8Viun9YBkG5tUKr8ljwfHQCnBgi4aWfAjiAzPusAMP4D310w' +
  'Mm6XnR6Q9C8VQPwd69fB2MxTJmDPT9kqgOh7NgtCtySMBPI0FQCGG4CEkxsbHaFRA1DkOaNQ7yw5hSU6h6UFiOz1cUEAZBG8' +
  'VJypAYgIaLBA9v+4l5qbn60BIkmX4j74ehT060hHyZlWFUDExesqa4KfUyf++/wMon9OLrQBIME2dPH7u9oUALGcCyjm0eEA' +
  'ufEd3xEgLmH6Wgeppd7jAW4It4Px+f3MNwbIqtWnAOjaBE0AoGM/thyFIlMCTAhA/ZqgciYmyZI/OJTes/oehgOAaDs6rtj1' +
  'IwBOyTyVGUq92URX+T6Ap6oJwG6U1QCwZJRP5ke93RhV+0rJov10VgRhQ4BT9uae2PwaDeBF01RcA4HX2D6QOpgU9NOr/rwh' +
  'AMlWCj+DPZJ4Z7UTQFZC8rBT+rzLAKZrVYP8QPIhvmogyPZtQZmhQf1y03ilqgSA8sR7rfDDOEuJSj/AetdlUxYFAN0GFpjv' +
  'e6mrGniNK1C689gQgBQCFC7Ov1gAHLKnKchH+Ba7doe+OIwv3EzHyz6AJMVh4uV5sCAp9JpfhW5VOzd54j2GEMgoca9NiVRx' +
  'FZJlh6Bh5sDVFQmDsHjjoeyXL9c/WNfe3cskNILKa75v4drNWoDCHfflskWqFATcvXrzrqvfV5WBN61a66wKiEoFEOaVj3er' +
  'GqIIY2pPu4IzWJ2iv7Bq8G5RiJZpXPFvV12MFnlsCfxdWMi7Xn7SqPq6uGDhy9oBFQqOFhX8S+rl0X/14M+3uUNh9vL981+g' +
  'MP0VFvNfIjL/NS7zX6Qz/1VG818mdb9JcG7/R4eRW1faDboT0f5exLmvdfyAizU/4GrTD7hc9hOu9122bNmyZcuWLVu2bNkn' +
  '2V9fAe+BPOvyrwAAAABJRU5ErkJggg==';

export function logoAttachment() {
  return {
    filename: LOGO_FILENAME,
    content: Buffer.from(LOGO_PNG_BASE64, 'base64'),
    contentType: LOGO_CONTENT_TYPE,
    cid: LOGO_CID,
  };
}
