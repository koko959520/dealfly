import {
  Body, Button, Container, Head, Heading, Hr, Html,
  Link, Preview, Row, Column, Section, Text, Tailwind,
} from '@react-email/components'
import type { CuratedDeal } from '@/src/newsletter/deal-curator'

interface NewsletterEmailProps {
  deals: CuratedDeal[]
  unsubscribeUrl: string
  baseUrl: string
}

const ZONE_EMOJI: Record<string, string> = {
  europe: '🇪🇺', amerique: '🌎', asie: '🌏', afrique: '🌍', autre: '✈️',
}

export default function NewsletterEmail({
  deals,
  unsubscribeUrl,
  baseUrl,
}: NewsletterEmailProps) {
  const preview = `${deals.length} deals détectés — jusqu'à -${Math.max(...deals.map((d) => d.discountPct))}% sur vos vols`

  return (
    <Html lang="fr">
      <Head />
      <Preview>{preview}</Preview>
      <Tailwind>
        <Body className="bg-gray-50 font-sans">
          <Container className="max-w-[600px] mx-auto">

            {/* Header */}
            <Section className="bg-blue-600 rounded-t-2xl px-8 py-8 text-center">
              <Heading className="text-white text-3xl font-black m-0">✈️ DealFly</Heading>
              <Text className="text-blue-100 m-0 mt-2 text-sm">
                Vos alertes deals du {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
              </Text>
            </Section>

            {/* Intro */}
            <Section className="bg-white px-8 py-6">
              <Text className="text-gray-700 text-base m-0">
                Bonjour,
              </Text>
              <Text className="text-gray-700 text-base mt-3">
                Notre radar a détecté <strong>{deals.length} deal{deals.length > 1 ? 's' : ''} exceptionnel{deals.length > 1 ? 's' : ''}</strong> cette semaine.
                Ces offres ont été validées manuellement et représentent des réductions de <strong>−35% à −{Math.max(...deals.map((d) => Math.round(d.discountPct)))}%</strong> par rapport aux prix habituels.
              </Text>
            </Section>

            <Hr className="border-gray-200 mx-0" />

            {/* Deals */}
            {deals.map((deal, i) => (
              <Section key={deal.id} className="bg-white px-8 py-6">
                {i > 0 && <Hr className="border-gray-100 mx-0 mb-6" />}

                <Row>
                  <Column className="w-full">
                    <Text className="text-xs font-semibold text-gray-400 uppercase tracking-widest m-0">
                      {ZONE_EMOJI[deal.zone] ?? '✈️'} {deal.zone.toUpperCase()} · Deal #{i + 1}
                    </Text>

                    <Heading className="text-gray-900 text-xl font-bold mt-2 mb-1">
                      {deal.origin} → {deal.destination}
                    </Heading>

                    {deal.airline && (
                      <Text className="text-gray-500 text-sm m-0 mb-3">{deal.airline}</Text>
                    )}

                    <Row className="mb-4">
                      <Column>
                        <Text className="text-4xl font-black text-gray-900 m-0">
                          {deal.priceEur}€
                        </Text>
                        <Text className="text-green-600 font-bold text-sm m-0">
                          −{Math.round(deal.discountPct)}% vs prix habituel
                        </Text>
                      </Column>
                      <Column className="text-right">
                        <Text className="text-xs text-gray-500 m-0">Score qualité</Text>
                        <Text className="text-2xl font-black text-blue-600 m-0">{deal.score}/100</Text>
                      </Column>
                    </Row>

                    <Text className="text-sm text-gray-600 m-0">
                      📅 Aller : <strong>{deal.optimalDepart}</strong>
                      {deal.optimalReturn && (
                        <> &nbsp;·&nbsp; 🔁 Retour : <strong>{deal.optimalReturn}</strong></>
                      )}
                    </Text>

                    <Button
                      href={`${baseUrl}/search?origin=${deal.origin}&destination=${deal.destination}`}
                      className="bg-blue-600 text-white font-semibold text-sm px-6 py-3 rounded-xl mt-4 no-underline inline-block"
                    >
                      Voir le deal →
                    </Button>
                  </Column>
                </Row>
              </Section>
            ))}

            <Hr className="border-gray-200 mx-0" />

            {/* Footer */}
            <Section className="bg-gray-50 rounded-b-2xl px-8 py-6 text-center">
              <Text className="text-gray-500 text-xs m-0">
                Vous recevez cet email car vous êtes inscrit aux alertes DealFly.
              </Text>
              <Text className="text-gray-500 text-xs mt-2 m-0">
                <Link href={unsubscribeUrl} className="text-gray-400 underline">
                  Me désinscrire en 1 clic
                </Link>
              </Text>
              <Text className="text-gray-400 text-xs mt-4 m-0">
                DealFly · Alertes deals aériens
              </Text>
            </Section>

          </Container>
        </Body>
      </Tailwind>
    </Html>
  )
}
