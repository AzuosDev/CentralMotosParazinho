// Máscara de CPF (11 dígitos) ou CNPJ (14) enquanto o usuário digita — usada no checkout
// e na seção de pagamento das Configurações (o Asaas exige o documento para gerar PIX).
export function formatCpfCnpj(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, (_, a, b, c, d) =>
      [a, b, c].filter(Boolean).join(".") + (d ? "-" + d : ""),
    );
  }
  return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, (_, a, b, c, d, e) =>
    `${a}.${b}.${c}/${d}` + (e ? "-" + e : ""),
  );
}
