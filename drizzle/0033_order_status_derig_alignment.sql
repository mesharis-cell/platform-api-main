DO $$
DECLARE
    has_awaiting_fabrication boolean;
    has_derig boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'order_status'
          AND e.enumlabel = 'AWAITING_FABRICATION'
    )
    INTO has_awaiting_fabrication;

    SELECT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'order_status'
          AND e.enumlabel = 'DERIG'
    )
    INTO has_derig;

    IF has_awaiting_fabrication AND NOT has_derig THEN
        -- Remap any legacy rows before swapping to the current enum shape.
        UPDATE public.orders
        SET order_status = 'IN_PREPARATION'::public.order_status
        WHERE order_status::text = 'AWAITING_FABRICATION';

        UPDATE public.order_status_history
        SET status = 'IN_PREPARATION'::public.order_status
        WHERE status::text = 'AWAITING_FABRICATION';

        ALTER TABLE public.orders
            ALTER COLUMN order_status DROP DEFAULT;

        ALTER TYPE public.order_status RENAME TO order_status_old;

        CREATE TYPE public.order_status AS ENUM (
            'DRAFT',
            'SUBMITTED',
            'PRICING_REVIEW',
            'PENDING_APPROVAL',
            'QUOTED',
            'DECLINED',
            'CONFIRMED',
            'IN_PREPARATION',
            'READY_FOR_DELIVERY',
            'IN_TRANSIT',
            'DELIVERED',
            'IN_USE',
            'DERIG',
            'AWAITING_RETURN',
            'RETURN_IN_TRANSIT',
            'CLOSED',
            'CANCELLED'
        );

        ALTER TABLE public.orders
            ALTER COLUMN order_status TYPE public.order_status
            USING order_status::text::public.order_status;

        ALTER TABLE public.order_status_history
            ALTER COLUMN status TYPE public.order_status
            USING status::text::public.order_status;

        ALTER TABLE public.orders
            ALTER COLUMN order_status SET DEFAULT 'DRAFT'::public.order_status;

        DROP TYPE public.order_status_old;
    END IF;
END $$;
