import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { PrismaClient, Prisma } from '@prisma/client';

interface RouteParams {
  params: { id: string };
}

// @swagger
// /api/conversations/{id}/messages:
//   get:
//     summary: Get all messages in a conversation
//     tags:
//       - Messages
//     parameters:
//       - in: path
//         name: id
//         required: true
//         schema:
//           type: string
//       - in: query
//         name: limit
//         schema:
//           type: integer
//           default: 50
//       - in: query
//         name: before
//         schema:
//           type: string
//           format: date-time
//     responses:
//       200:
//         description: List of messages
//       404:
//         description: Conversation not found
//       500:
//         description: Server error
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '50');
    const before = searchParams.get('before');

    // Verify conversation exists
    const conversation = await prisma.conversations.findUnique({
      where: { id: params.id }
    });

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // Check authorization if conversation belongs to a user
    if (conversation.userId) {
      const decodedToken = await verifyToken(request);
      if (!decodedToken || (decodedToken.userId !== conversation.userId && decodedToken.role !== 'admin')) {
        return NextResponse.json(
          { error: 'Unauthorized to view these messages' },
          { status: 403 }
        );
      }
    }

    // Fetch messages with pagination
    const messages = await prisma.messages.findMany({
      where: {
        conversationId: params.id,
        ...(before ? {
          createdAt: { lt: new Date(before) }
        } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    return NextResponse.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    return NextResponse.json(
      { error: 'Failed to fetch messages' },
      { status: 500 }
    );
  }
}

// @swagger
// /api/conversations/{id}/messages:
//   post:
//     summary: Add a new message to a conversation
//     tags:
//       - Messages
//     parameters:
//       - in: path
//         name: id
//         required: true
//         schema:
//           type: string
//     requestBody:
//       required: true
//       content:
//         application/json:
//           schema:
//             type: object
//             required:
//               - content
//             properties:
//               content:
//                 type: string
//               isUser:
//                 type: boolean
//                 default: true
//     responses:
//       201:
//         description: Message created successfully
//       400:
//         description: Invalid request
//       404:
//         description: Conversation not found
//       500:
//         description: Server error
export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    // Verify conversation exists
    const conversation = await prisma.conversations.findUnique({
      where: { id: params.id }
    });

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // Check authorization if conversation belongs to a user
    if (conversation.userId) {
      const decodedToken = await verifyToken(request);
      if (!decodedToken || (decodedToken.userId !== conversation.userId && decodedToken.role !== 'admin')) {
        return NextResponse.json(
          { error: 'Unauthorized to add messages to this conversation' },
          { status: 403 }
        );
      }
    }

    const { content, isUser = true } = await request.json();

    if (!content) {
      return NextResponse.json(
        { error: 'Message content is required' },
        { status: 400 }
      );
    }

    // Create message and update conversation timestamp in a transaction
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const message = await tx.messages.create({
        data: {
          conversationId: params.id,
          content,
          isUser
        }
      });

      // Update conversation timestamp
      await tx.conversations.update({
        where: { id: params.id },
        data: { updatedAt: new Date() }
      });

      return message;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating message:', error);
    return NextResponse.json(
      { error: 'Failed to create message' },
      { status: 500 }
    );
  }
}
