export type ManagerTicketFilterItem = {
  id: string;
  status: string;
  sourceChannel: string;
  priority: number;
  aiSummary: string;
  complaint: {
    title: string;
    description: string;
    location: string;
  };
  room?: {
    buildingName?: string;
    roomNo?: string;
  };
};

function normalizedTokens(query: string) {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function searchableTicketText(ticket: ManagerTicketFilterItem) {
  return [
    ticket.status,
    ticket.sourceChannel,
    `p${ticket.priority}`,
    ticket.aiSummary,
    ticket.complaint.title,
    ticket.complaint.description,
    ticket.complaint.location,
    ticket.room?.buildingName,
    ticket.room?.roomNo
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function filterManagerTickets<T extends ManagerTicketFilterItem>(tickets: T[], query: string) {
  const tokens = normalizedTokens(query);

  if (tokens.length === 0) {
    return tickets;
  }

  return tickets.filter((ticket) => {
    const text = searchableTicketText(ticket);
    return tokens.every((token) => text.includes(token));
  });
}

export function managerTicketFilterLabel(totalCount: number, visibleCount: number, query: string) {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return `${totalCount}건 표시`;
  }

  return `${visibleCount}/${totalCount}건 표시 · ${trimmedQuery}`;
}
