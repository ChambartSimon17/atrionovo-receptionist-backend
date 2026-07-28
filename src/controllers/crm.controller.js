export async function lookupClient(request, reply) {
  const { email } = request.body;

  return {
    success: true,
    message: "Client lookup endpoint reached.",
    client: {
      email,
    },
  };
}