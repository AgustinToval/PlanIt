import { Server, Socket } from "socket.io";

export function socketHandler(io: Server) {
  io.on("connection", (socket: Socket) => {
    console.log(`⚡ Client connected: ${socket.id}`);

    // Join a plan room for real-time updates
    socket.on("join:plan", (planId: string) => {
      socket.join(`plan:${planId}`);
      console.log(`Socket ${socket.id} joined plan:${planId}`);
    });

    // Join a group room
    socket.on("join:group", (groupId: string) => {
      socket.join(`group:${groupId}`);
    });

    // Leave rooms
    socket.on("leave:plan", (planId: string) => {
      socket.leave(`plan:${planId}`);
    });

    socket.on("leave:group", (groupId: string) => {
      socket.leave(`group:${groupId}`);
    });

    // Typing indicator — relayed to everyone else in the room, not persisted.
    // kind: "plan" | "group"; typing: true while composing, false when stopped.
    socket.on("typing", (data: { kind: string; roomId: string; userId: string; name: string | null; typing: boolean }) => {
      const room = data.kind === "group" ? `group:${data.roomId}` : `plan:${data.roomId}`;
      socket.to(room).emit("typing", data);
    });

    // Plan chat message
    socket.on("message:plan", (data: { planId: string; message: object }) => {
      io.to(`plan:${data.planId}`).emit("message:new", data.message);
    });

    // Group chat message
    socket.on("message:group", (data: { groupId: string; message: object }) => {
      io.to(`group:${data.groupId}`).emit("message:new", data.message);
    });

    // Activity updated (reorder, check off)
    socket.on("activity:update", (data: { planId: string; activity: object }) => {
      socket.to(`plan:${data.planId}`).emit("activity:updated", data.activity);
    });

    // Checklist item toggled
    socket.on("checklist:toggle", (data: { planId: string; itemId: string; checked: boolean }) => {
      socket.to(`plan:${data.planId}`).emit("checklist:toggled", data);
    });

    // Expense added
    socket.on("expense:add", (data: { planId: string; expense: object }) => {
      io.to(`plan:${data.planId}`).emit("expense:added", data.expense);
    });

    // RSVP to quick plan
    socket.on("rsvp:update", (data: { planId: string; userId: string; rsvp: string }) => {
      io.to(`plan:${data.planId}`).emit("rsvp:updated", data);
    });

    // Meetup tracker status
    socket.on("meetup:status", (data: { planId: string; userId: string; status: string }) => {
      io.to(`plan:${data.planId}`).emit("meetup:updated", data);
    });

    // Vote cast
    socket.on("vote:cast", (data: { planId: string; voteId: string; results: object }) => {
      io.to(`plan:${data.planId}`).emit("vote:updated", data);
    });

    socket.on("disconnect", () => {
      console.log(`❌ Client disconnected: ${socket.id}`);
    });
  });
}
